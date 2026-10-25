import { count, eq, sql } from "drizzle-orm";
import { getAuth } from "@clerk/express";
import type { NextFunction, Request, RequestHandler, Response } from "express";
import { appUsersTable, db, type TeamMemberStatus, type TeamRole } from "@workspace/db";

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

async function ensureLocalUser(
  clerkUserId: string,
  profile: { displayName: string | null; email: string | null },
): Promise<CurrentAppUser> {
  const [existing] = await db
    .select()
    .from(appUsersTable)
    .where(eq(appUsersTable.clerkUserId, clerkUserId));

  if (existing) {
    const changes: Partial<typeof appUsersTable.$inferInsert> = {};
    if (profile.displayName && profile.displayName !== existing.displayName) {
      changes.displayName = profile.displayName;
    }
    if (profile.email && profile.email !== existing.email) {
      changes.email = profile.email;
    }
    if (Object.keys(changes).length > 0) {
      const [updated] = await db
        .update(appUsersTable)
        .set(changes)
        .where(eq(appUsersTable.id, existing.id))
        .returning();
      return updated;
    }
    return existing;
  }

  return db.transaction(async (tx) => {
    // Serialize first-login provisioning so simultaneous registrations cannot
    // both receive the administrator role.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(68434921)`);
    const [concurrentUser] = await tx
      .select()
      .from(appUsersTable)
      .where(eq(appUsersTable.clerkUserId, clerkUserId));
    if (concurrentUser) return concurrentUser;

    const [userCount] = await tx.select({ count: count() }).from(appUsersTable);
    const isFirstUser = Number(userCount?.count ?? 0) === 0;
    const [created] = await tx
      .insert(appUsersTable)
      .values({
        clerkUserId,
        displayName: profile.displayName,
        email: profile.email,
        role: isFirstUser ? "admin" : "lawyer",
        status: isFirstUser ? "active" : "pending",
      })
      .returning();
    return created;
  });
}

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

export const requireActiveUser: RequestHandler = (req, res, next): void => {
  if (req.appUser?.status !== "active") {
    res.status(403).json({
      error: req.appUser?.status === "disabled" ? "Account disabled" : "Administrator approval required",
      code: req.appUser?.status === "disabled" ? "ACCOUNT_DISABLED" : "ACCOUNT_PENDING",
    });
    return;
  }
  next();
};

export const requireAdministrator: RequestHandler = (req, res, next): void => {
  if (req.appUser?.role !== "admin") {
    res.status(403).json({ error: "Administrator access required" });
    return;
  }
  next();
};
