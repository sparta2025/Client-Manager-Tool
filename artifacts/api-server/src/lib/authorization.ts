import { and, eq, type SQL } from "drizzle-orm";
import { clientsTable, db } from "@workspace/db";
import type { CurrentAppUser } from "../middlewares/auth";

export function clientVisibilityCondition(user: CurrentAppUser): SQL | undefined {
  return user.role === "admin"
    ? undefined
    : eq(clientsTable.assignedToUserId, user.id);
}

export function accessibleClientCondition(
  user: CurrentAppUser,
  clientId: number,
): SQL | undefined {
  return and(
    eq(clientsTable.id, clientId),
    user.role === "admin" ? undefined : eq(clientsTable.assignedToUserId, user.id),
  );
}

export async function getAccessibleClient(user: CurrentAppUser, clientId: number) {
  const [client] = await db
    .select()
    .from(clientsTable)
    .where(accessibleClientCondition(user, clientId));
  return client;
}

export function isCaseWriter(user: CurrentAppUser): boolean {
  return user.status === "active";
}

export function canDeleteCaseData(user: CurrentAppUser): boolean {
  return user.role === "admin" || user.role === "lawyer";
}

export function canChangeCaseStatus(user: CurrentAppUser): boolean {
  return user.role === "admin" || user.role === "lawyer";
}
