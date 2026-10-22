import { count, eq, sql } from "drizzle-orm";
import { getAuth } from "@clerk/express";
import type { NextFunction, Request, RequestHandler, Response } from "express";
import { appUsersTable, db, type TeamMemberStatus, type TeamRole } from "@workspace/db";
import { createEnsureLocalUser } from "../lib/local-user-provisioning.js";

export type CurrentAppUser = {
  id: number;
  clerkUserId: string;
  displayName: string | null;
  email: string | null;
  role: TeamRole;
  status: TeamMemberStatus;
  createdAt: Date;
  updatedAt: Date;
};

declare global {
  namespace Express {
    interface Request {
      appUser?: CurrentAppUser;
    }
  }
}

function stringClaim(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

const ensureLocalUser = createEnsureLocalUser<CurrentAppUser>({
  findByClerkUserId: async (clerkUserId) => {
    const [user] = await db
      .select()
      .from(appUsersTable)
      .where(eq(appUsersTable.clerkUserId, clerkUserId));
    return user;
  },
  updateProfile: async (id, changes) => {
    const [user] = await db
      .update(appUsersTable)
      .set(changes)
      .where(eq(appUsersTable.id, id))
      .returning();
    if (!user) throw new Error(`Unable to update local user ${id}`);
    return user;
  },
  transaction: (callback) =>
    db.transaction((tx) =>
      callback({
        lockInitialRegistration: async () => {
          await tx.execute(sql`SELECT pg_advisory_xact_lock(68434921)`);
        },
        findByClerkUserId: async (clerkUserId) => {
          const [user] = await tx
            .select()
            .from(appUsersTable)
            .where(eq(appUsersTable.clerkUserId, clerkUserId));
          return user;
        },
        countUsers: async () => {
          const [userCount] = await tx.select({ count: count() }).from(appUsersTable);
          return Number(userCount?.count ?? 0);
        },
        createUser: async (userData) => {
          const [user] = await tx.insert(appUsersTable).values(userData).returning();
          if (!user) throw new Error("Unable to create local user");
          return user;
        },
      }),
    ),
});

export const requireClerkUser: RequestHandler = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  const auth = getAuth(req);
  if (!auth.userId) {
    res.status(401).json({ error: "Sign-in required" });
    return;
  }

  const claims = auth.sessionClaims as Record<string, unknown> | null;
  const firstName = stringClaim(claims?.firstName);
  const lastName = stringClaim(claims?.lastName);
  const displayName =
    stringClaim(claims?.name) ??
    [firstName, lastName].filter(Boolean).join(" ") ??
    null;
  const email = stringClaim(claims?.email);

  req.appUser = await ensureLocalUser(auth.userId, { displayName, email });
  next();
};

export { requireActiveUser, requireAdministrator } from "./auth-guards.js";
