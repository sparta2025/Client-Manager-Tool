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

  const { createdAt, closedAt, ...rest } = parsed.data;
  const updates: Partial<typeof clientsTable.$inferInsert> = { ...rest };

  if (createdAt !== undefined) {
    updates.createdAt = new Date(createdAt);
  }
  if (closedAt !== undefined) {
    updates.closedAt = closedAt === null ? null : new Date(closedAt);
  } else if (rest.status === "closed") {
    const [existing] = await db
      .select({ closedAt: clientsTable.closedAt })
      .from(clientsTable)
      .where(eq(clientsTable.id, params.data.id));
    if (existing && !existing.closedAt) {
      updates.closedAt = new Date();
    }
  } else if (rest.status) {
    updates.closedAt = null;
  }

  const [client] = await db
    .update(clientsTable)
    .set(updates)
    .where(eq(clientsTable.id, params.data.id))
    .returning();

  if (!client) {
    res.status(404).json({ error: "Client not found" });
    return;
  }

  res.json(UpdateClientResponse.parse(client));
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
