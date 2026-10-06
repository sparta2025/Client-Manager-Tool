import { Router, type IRouter } from "express";
import { eq, sql } from "drizzle-orm";
import { db, caseStagesTable, clientsTable } from "@workspace/db";
import {
  CreateClientBody,
  UpdateClientParams,
  UpdateClientBody,
  DeleteClientParams,
  ListClientsResponse,
  CreateClientResponse,
  UpdateClientResponse,
  GetClientsSummaryResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/clients", async (_req, res): Promise<void> => {
  const clients = await db
    .select()
    .from(clientsTable)
    .orderBy(clientsTable.createdAt);
  res.json(ListClientsResponse.parse(clients));
});

router.get("/clients/summary", async (_req, res): Promise<void> => {
  const rows = await db
    .select({
      status: clientsTable.status,
      count: sql<number>`count(*)`,
    })
    .from(clientsTable)
    .groupBy(clientsTable.status);

  const summary = { new: 0, in_progress: 0, closed: 0, total: 0 };
  for (const row of rows) {
    const count = Number(row.count);
    if (row.status === "new" || row.status === "in_progress" || row.status === "closed") {
      summary[row.status] = count;
    }
    summary.total += count;
  }

  res.json(GetClientsSummaryResponse.parse(summary));
});

router.post("/clients", async (req, res): Promise<void> => {
  const parsed = CreateClientBody.safeParse(req.body);
  if (!parsed.success) {
    req.log.warn({ errors: parsed.error.message }, "Invalid request body");
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const initialRequest = parsed.data.initialRequest?.trim();
  const initialControlDate = parsed.data.initialControlDate;
  const initialIsUrgent = parsed.data.initialIsUrgent ?? false;
  const hasInitialIntake = Boolean(initialRequest || initialControlDate || initialIsUrgent);

  const client = await db.transaction(async (tx) => {
    const [createdClient] = await tx
      .insert(clientsTable)
      .values({
        name: parsed.data.name,
        phone: parsed.data.phone,
        status: parsed.data.status ?? "new",
        ...(parsed.data.createdAt ? { createdAt: new Date(parsed.data.createdAt) } : {}),
      })
      .returning();

    if (hasInitialIntake) {
      await tx.insert(caseStagesTable).values({
        clientId: createdClient.id,
        name: "Заявление или обращение клиента",
        stageDate: createdClient.createdAt,
        content: initialRequest || null,
        controlDate: initialControlDate ? new Date(initialControlDate) : null,
        isUrgent: initialIsUrgent,
      });
    }

    return createdClient;
  });

  res.status(201).json(CreateClientResponse.parse(client));
});

router.patch("/clients/:id", async (req, res): Promise<void> => {
  const params = UpdateClientParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateClientBody.safeParse(req.body);
  if (!parsed.success) {
    req.log.warn({ errors: parsed.error.message }, "Invalid request body");
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { createdAt, closedAt, closingSummary, ...rest } = parsed.data;
  const result = await db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ status: clientsTable.status })
      .from(clientsTable)
      .where(eq(clientsTable.id, params.data.id))
      .for("update");

    if (!existing) return { kind: "not-found" as const };

    const isNewClosure = rest.status === "closed" && existing.status !== "closed";
    const finalResult = closingSummary?.trim();
    if (isNewClosure && !finalResult) {
      return { kind: "closing-summary-required" as const };
    }

    const updates: Partial<typeof clientsTable.$inferInsert> = { ...rest };
    if (createdAt !== undefined) {
      updates.createdAt = new Date(createdAt);
    }
    if (rest.status === "closed") {
      updates.closedAt = closedAt ? new Date(closedAt) : new Date();
    } else if (rest.status) {
      updates.closedAt = null;
    } else if (closedAt !== undefined) {
      updates.closedAt = closedAt === null ? null : new Date(closedAt);
    }

    const [updatedClient] = await tx
      .update(clientsTable)
      .set(updates)
      .where(eq(clientsTable.id, params.data.id))
      .returning();

    if (isNewClosure && finalResult && updatedClient.closedAt) {
      await tx.insert(caseStagesTable).values({
        clientId: updatedClient.id,
        name: "Итог дела",
        stageDate: updatedClient.closedAt,
        result: finalResult,
        isCompleted: true,
        closedAt: updatedClient.closedAt,
      });
    }

    return { kind: "updated" as const, client: updatedClient };
  });

  if (result.kind === "not-found") {
    res.status(404).json({ error: "Client not found" });
    return;
  }

  if (result.kind === "closing-summary-required") {
    res.status(400).json({ error: "Укажите итоговый результат перед закрытием дела" });
    return;
  }

  res.json(UpdateClientResponse.parse(result.client));
});

router.delete("/clients/:id", async (req, res): Promise<void> => {
  const params = DeleteClientParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [client] = await db
    .delete(clientsTable)
    .where(eq(clientsTable.id, params.data.id))
    .returning();

  if (!client) {
    res.status(404).json({ error: "Client not found" });
    return;
  }

  res.sendStatus(204);
});

export default router;
