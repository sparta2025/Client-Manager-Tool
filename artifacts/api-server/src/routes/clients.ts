import { Router, type IRouter } from "express";
import { eq, sql } from "drizzle-orm";
import { getTableColumns } from "drizzle-orm";
import { appUsersTable, db, caseStagesTable, clientsTable } from "@workspace/db";
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
import {
  accessibleClientCondition,
  canChangeCaseStatus,
  clientVisibilityCondition,
} from "../lib/authorization";
import { requireAdministrator } from "../middlewares/auth";

const router: IRouter = Router();

async function getClientForResponse(id: number) {
  const [client] = await db
    .select({
      ...getTableColumns(clientsTable),
      assignedToUserName: appUsersTable.displayName,
    })
    .from(clientsTable)
    .leftJoin(appUsersTable, eq(clientsTable.assignedToUserId, appUsersTable.id))
    .where(eq(clientsTable.id, id));
  return client;
}

async function isActiveAssignee(id: number | null): Promise<boolean> {
  if (id === null) return true;
  const [assignee] = await db
    .select({ status: appUsersTable.status })
    .from(appUsersTable)
    .where(eq(appUsersTable.id, id));
  return assignee?.status === "active";
}

router.get("/clients", async (req, res): Promise<void> => {
  const clients = await db
    .select({
      ...getTableColumns(clientsTable),
      assignedToUserName: appUsersTable.displayName,
    })
    .from(clientsTable)
    .leftJoin(appUsersTable, eq(clientsTable.assignedToUserId, appUsersTable.id))
    .where(clientVisibilityCondition(req.appUser!))
    .orderBy(clientsTable.createdAt);
  res.json(ListClientsResponse.parse(clients));
});

router.get("/clients/summary", async (req, res): Promise<void> => {
  const rows = await db
    .select({
      status: clientsTable.status,
      count: sql<number>`count(*)`,
    })
    .from(clientsTable)
    .where(clientVisibilityCondition(req.appUser!))
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
  const user = req.appUser!;
  if (user.role !== "admin" && parsed.data.status && parsed.data.status !== "new") {
    res.status(403).json({ error: "Only an administrator can create a case with a non-new status" });
    return;
  }
  if (
    user.role !== "admin" &&
    parsed.data.assignedToUserId !== undefined &&
    parsed.data.assignedToUserId !== user.id
  ) {
    res.status(403).json({ error: "Only an administrator can assign a case to another user" });
    return;
  }
  const assignedToUserId =
    user.role === "admin" ? (parsed.data.assignedToUserId ?? null) : user.id;
  if (user.role === "admin" && !(await isActiveAssignee(assignedToUserId))) {
    res.status(400).json({ error: "Cases can only be assigned to active team members" });
    return;
  }

  const client = await db.transaction(async (tx) => {
    const [createdClient] = await tx
      .insert(clientsTable)
      .values({
        name: parsed.data.name,
        phone: parsed.data.phone,
        status: parsed.data.status ?? "new",
        assignedToUserId,
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

  const responseClient = await getClientForResponse(client.id);
  res.status(201).json(CreateClientResponse.parse(responseClient));
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

  const user = req.appUser!;
  if (user.role !== "admin" && parsed.data.assignedToUserId !== undefined) {
    res.status(403).json({ error: "Only an administrator can reassign a case" });
    return;
  }
  if (
    !canChangeCaseStatus(user) &&
    (parsed.data.status !== undefined ||
      parsed.data.createdAt !== undefined ||
      parsed.data.closedAt !== undefined ||
      parsed.data.closingSummary !== undefined)
  ) {
    res.status(403).json({ error: "Assistants cannot change case status or closure dates" });
    return;
  }
  if (
    user.role === "admin" &&
    parsed.data.assignedToUserId !== undefined &&
    !(await isActiveAssignee(parsed.data.assignedToUserId))
  ) {
    res.status(400).json({ error: "Cases can only be assigned to active team members" });
    return;
  }

  const { createdAt, closedAt, closingSummary, assignedToUserId: newAssignee, ...rest } = parsed.data;
  const result = await db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ status: clientsTable.status })
      .from(clientsTable)
      .where(accessibleClientCondition(user, params.data.id))
      .for("update");

    if (!existing) return { kind: "not-found" as const };

    const isNewClosure = rest.status === "closed" && existing.status !== "closed";
    const finalResult = closingSummary?.trim();
    if (isNewClosure && !finalResult) {
      return { kind: "closing-summary-required" as const };
    }

    const updates: Partial<typeof clientsTable.$inferInsert> = { ...rest };
    if (newAssignee !== undefined) updates.assignedToUserId = newAssignee;
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

  const responseClient = await getClientForResponse(result.client.id);
  res.json(UpdateClientResponse.parse(responseClient));
});

router.delete("/clients/:id", requireAdministrator, async (req, res): Promise<void> => {
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
