import { Router, type IRouter } from "express";
import { eq, and, count, max } from "drizzle-orm";
import { db, clientsTable, caseStagesTable } from "@workspace/db";
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

const router: IRouter = Router();

// GET /clients/:clientId/stages
router.get("/clients/:clientId/stages", async (req, res): Promise<void> => {
  const params = ListClientStagesParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [client] = await db
    .select({ id: clientsTable.id })
    .from(clientsTable)
    .where(eq(clientsTable.id, params.data.clientId));
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
  const [client] = await db
    .select({ id: clientsTable.id })
    .from(clientsTable)
    .where(eq(clientsTable.id, params.data.clientId));
  if (!client) {
    res.status(404).json({ error: "Client not found" });
    return;
  }
  const [stage] = await db
    .insert(caseStagesTable)
    .values({
      clientId: params.data.clientId,
      name: parsed.data.name,
      stageDate: new Date(parsed.data.stageDate),
      content: parsed.data.content ?? null,
      result: parsed.data.result ?? null,
      isCompleted: parsed.data.isCompleted ?? false,
      failureReasons: parsed.data.failureReasons ?? null,
      nextPlans: parsed.data.nextPlans ?? null,
      closedAt: parsed.data.closedAt ? new Date(parsed.data.closedAt) : null,
    })
    .returning();
  res.status(201).json(CreateClientStageResponse.parse(stage));
});

// GET /clients/:clientId/stats
router.get("/clients/:clientId/stats", async (req, res): Promise<void> => {
  const params = GetClientStatsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [client] = await db
    .select({ id: clientsTable.id })
    .from(clientsTable)
    .where(eq(clientsTable.id, params.data.clientId));
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

  const { stageDate, closedAt, ...rest } = parsed.data;
  const updates: Partial<typeof caseStagesTable.$inferInsert> = { ...rest };
  if (stageDate !== undefined) updates.stageDate = new Date(stageDate);
  if (closedAt !== undefined) updates.closedAt = closedAt ? new Date(closedAt) : null;

  const [stage] = await db
    .update(caseStagesTable)
    .set(updates)
    .where(eq(caseStagesTable.id, params.data.id))
    .returning();
  if (!stage) {
    res.status(404).json({ error: "Stage not found" });
    return;
  }
  res.json(UpdateStageResponse.parse(stage));
});

// DELETE /stages/:id
router.delete("/stages/:id", async (req, res): Promise<void> => {
  const params = DeleteStageParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [stage] = await db
    .delete(caseStagesTable)
    .where(eq(caseStagesTable.id, params.data.id))
    .returning();
  if (!stage) {
    res.status(404).json({ error: "Stage not found" });
    return;
  }
  res.sendStatus(204);
});

export default router;
