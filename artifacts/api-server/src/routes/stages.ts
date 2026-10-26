import { Router, type IRouter } from "express";
import { eq, and, count, max, sql } from "drizzle-orm";
import { db, caseStagesTable, clientsTable } from "@workspace/db";
import {
  ListClientStagesParams,
  CreateClientStageParams,
  CreateClientStageBody,
  GetClientStatsParams,
  UpdateStageParams,
  UpdateStageBody,
  DeleteStageParams,
  ListClientStagesResponse,
  CreateClientStageResponse,
  GetClientStatsResponse,
  UpdateStageResponse,
} from "@workspace/api-zod";
import {
  canDeleteCaseData,
  accessibleClientCondition,
  getAccessibleClient,
} from "../lib/authorization";

const router: IRouter = Router();

// GET /clients/:clientId/stages
router.get("/clients/:clientId/stages", async (req, res): Promise<void> => {
  const params = ListClientStagesParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const client = await getAccessibleClient(req.appUser!, params.data.clientId);
  if (!client) {
    res.status(404).json({ error: "Client not found" });
    return;
  }
  const stages = await db
    .select()
    .from(caseStagesTable)
    .where(eq(caseStagesTable.clientId, params.data.clientId))
    .orderBy(caseStagesTable.stageDate);
  res.json(ListClientStagesResponse.parse(stages));
});

// POST /clients/:clientId/stages
router.post("/clients/:clientId/stages", async (req, res): Promise<void> => {
  const params = CreateClientStageParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = CreateClientStageBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  if (parsed.data.outcome && parsed.data.isCompleted === false) {
    res.status(400).json({ error: "An outcome can only be set on a completed stage" });
    return;
  }
  const result = await db.transaction(async (tx) => {
    const [client] = await tx
      .select({ status: clientsTable.status })
      .from(clientsTable)
      .where(accessibleClientCondition(req.appUser!, params.data.clientId))
      .for("update");
    if (!client) return { kind: "not-found" as const };
    if (client.status === "closed") return { kind: "closed" as const };
    const [stage] = await tx
      .insert(caseStagesTable)
      .values({
        clientId: params.data.clientId,
        name: parsed.data.name,
        stageDate: new Date(parsed.data.stageDate),
        content: parsed.data.content ?? null,
        result: parsed.data.result ?? null,
        outcome: parsed.data.outcome ?? null,
        isCompleted: parsed.data.isCompleted ?? false,
        isUrgent: parsed.data.isUrgent ?? false,
        failureReasons: parsed.data.failureReasons ?? null,
        nextPlans: parsed.data.nextPlans ?? null,
        controlDate: parsed.data.controlDate ? new Date(parsed.data.controlDate) : null,
        nextControlDate: parsed.data.nextControlDate ? new Date(parsed.data.nextControlDate) : null,
        closedAt: parsed.data.closedAt ? new Date(parsed.data.closedAt) : null,
      })
      .returning();
    return { kind: "created" as const, stage };
  });
  if (result.kind === "not-found") {
    res.status(404).json({ error: "Client not found" });
    return;
  }
  if (result.kind === "closed") {
    res.status(409).json({ error: "Closed case journal is read-only" });
    return;
  }
  res.status(201).json(CreateClientStageResponse.parse(result.stage));
});

// GET /clients/:clientId/stats
router.get("/clients/:clientId/stats", async (req, res): Promise<void> => {
  const params = GetClientStatsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const client = await getAccessibleClient(req.appUser!, params.data.clientId);
  if (!client) {
    res.status(404).json({ error: "Client not found" });
    return;
  }

  const [totals] = await db
    .select({ total: count() })
    .from(caseStagesTable)
    .where(eq(caseStagesTable.clientId, params.data.clientId));

  const [completedRow] = await db
    .select({ completed: count() })
    .from(caseStagesTable)
    .where(
      and(
        eq(caseStagesTable.clientId, params.data.clientId),
        eq(caseStagesTable.isCompleted, true),
      ),
    );

  const [outcomeCounts] = await db
    .select({
      successfulStages: sql<number>`count(*) filter (where ${caseStagesTable.outcome} = 'success')`,
      unsuccessfulStages: sql<number>`count(*) filter (where ${caseStagesTable.outcome} = 'unsuccessful')`,
      partialStages: sql<number>`count(*) filter (where ${caseStagesTable.outcome} = 'partial')`,
    })
    .from(caseStagesTable)
    .where(eq(caseStagesTable.clientId, params.data.clientId));

  const [lastStageRow] = await db
    .select({ lastStageDate: max(caseStagesTable.stageDate) })
    .from(caseStagesTable)
    .where(eq(caseStagesTable.clientId, params.data.clientId));

  // latest next plans from most recent active stage
  const [lastActive] = await db
    .select({ nextPlans: caseStagesTable.nextPlans })
    .from(caseStagesTable)
    .where(
      and(
        eq(caseStagesTable.clientId, params.data.clientId),
        eq(caseStagesTable.isCompleted, false),
      ),
    )
    .orderBy(caseStagesTable.stageDate)
    .limit(1);

  const totalStages = Number(totals?.total ?? 0);
  const completedStages = Number(completedRow?.completed ?? 0);

  res.json(
    GetClientStatsResponse.parse({
      clientId: params.data.clientId,
      totalStages,
      completedStages,
      activeStages: totalStages - completedStages,
      successfulStages: Number(outcomeCounts?.successfulStages ?? 0),
      unsuccessfulStages: Number(outcomeCounts?.unsuccessfulStages ?? 0),
      partialStages: Number(outcomeCounts?.partialStages ?? 0),
      lastStageDate: lastStageRow?.lastStageDate?.toISOString() ?? null,
      lastNextPlans: lastActive?.nextPlans ?? null,
    }),
  );
});

// PATCH /stages/:id
router.patch("/stages/:id", async (req, res): Promise<void> => {
  const params = UpdateStageParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateStageBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { stageDate, closedAt, controlDate, nextControlDate, ...rest } = parsed.data;
  if (rest.outcome && parsed.data.isCompleted === false) {
    res.status(400).json({ error: "An outcome can only be set on a completed stage" });
    return;
  }
  const updates: Partial<typeof caseStagesTable.$inferInsert> = { ...rest };
  if (stageDate !== undefined) updates.stageDate = new Date(stageDate);
  if (closedAt !== undefined) updates.closedAt = closedAt ? new Date(closedAt) : null;
  if (controlDate !== undefined) updates.controlDate = controlDate ? new Date(controlDate) : null;
  if (nextControlDate !== undefined) updates.nextControlDate = nextControlDate ? new Date(nextControlDate) : null;
  if (parsed.data.isCompleted === false && parsed.data.outcome === undefined) {
    updates.outcome = null;
  }

  const result = await db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ clientId: caseStagesTable.clientId })
      .from(caseStagesTable)
      .where(eq(caseStagesTable.id, params.data.id));
    if (!existing) return { kind: "not-found" as const };
    const [client] = await tx
      .select({ status: clientsTable.status })
      .from(clientsTable)
      .where(accessibleClientCondition(req.appUser!, existing.clientId))
      .for("update");
    if (!client) return { kind: "not-found" as const };
    if (client.status === "closed") return { kind: "closed" as const };
    const [stage] = await tx
      .update(caseStagesTable)
      .set(updates)
      .where(eq(caseStagesTable.id, params.data.id))
      .returning();
    return stage ? { kind: "updated" as const, stage } : { kind: "not-found" as const };
  });
  if (result.kind === "not-found") {
    res.status(404).json({ error: "Stage not found" });
    return;
  }
  if (result.kind === "closed") {
    res.status(409).json({ error: "Closed case journal is read-only" });
    return;
  }
  res.json(UpdateStageResponse.parse(result.stage));
});

// DELETE /stages/:id
router.delete("/stages/:id", async (req, res): Promise<void> => {
  const params = DeleteStageParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  if (!canDeleteCaseData(req.appUser!)) {
    res.status(403).json({ error: "Assistant access cannot delete case history" });
    return;
  }
  const result = await db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ clientId: caseStagesTable.clientId })
      .from(caseStagesTable)
      .where(eq(caseStagesTable.id, params.data.id));
    if (!existing) return { kind: "not-found" as const };
    const [client] = await tx
      .select({ status: clientsTable.status })
      .from(clientsTable)
      .where(accessibleClientCondition(req.appUser!, existing.clientId))
      .for("update");
    if (!client) return { kind: "not-found" as const };
    if (client.status === "closed") return { kind: "closed" as const };
    const [stage] = await tx
      .delete(caseStagesTable)
      .where(eq(caseStagesTable.id, params.data.id))
      .returning();
    return stage ? { kind: "deleted" as const } : { kind: "not-found" as const };
  });
  if (result.kind === "not-found") {
    res.status(404).json({ error: "Stage not found" });
    return;
  }
  if (result.kind === "closed") {
    res.status(409).json({ error: "Closed case journal is read-only" });
    return;
  }
  res.sendStatus(204);
});

export default router;
