import { and, count, eq, sql } from "drizzle-orm";
import { clerkClient, getAuth } from "@clerk/express";
import type { NextFunction, Request, RequestHandler, Response } from "express";
import { appUsersTable, db, type TeamMemberStatus, type TeamRole } from "@workspace/db";

export type CurrentAppUser = {
  id: number;
  clerkUserId: string;
  displayName: string | null;
  email: string | null;
  jobTitle: string | null;
  phone: string | null;
  profileEditedAt: Date | null;
  profileEditedBy: "admin" | "user" | null;
  identityEditedAt: Date | null;
  identityEditedBy: "admin" | "user" | null;
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

function emailClaim(claims: Record<string, unknown> | null): string | null {
  const direct =
    stringClaim(claims?.email) ??
    stringClaim(claims?.email_address) ??
    stringClaim(claims?.primary_email_address);
  if (direct) return direct;
  const addresses = claims?.email_addresses;
  if (!Array.isArray(addresses)) return null;
  for (const address of addresses) {
    if (address && typeof address === "object" && "email_address" in address) {
      const email = stringClaim((address as Record<string, unknown>).email_address);
      if (email) return email;
    }
  }
  return null;
}

async function ensureLocalUser(
  clerkUserId: string,
  profile: {
    displayName: string | null;
    email: string | null;
    verifiedRecoveryEmail: string | null;
  },
): Promise<CurrentAppUser> {
  const recoveryEmail = process.env.ADMIN_RECOVERY_EMAIL?.trim().toLowerCase();
  const canRecover = Boolean(
    recoveryEmail &&
    profile.verifiedRecoveryEmail?.trim().toLowerCase() === recoveryEmail,
  );
  const [existing] = await db
    .select()
    .from(appUsersTable)
    .where(eq(appUsersTable.clerkUserId, clerkUserId));

  if (existing && !canRecover) {
    const changes: Partial<typeof appUsersTable.$inferInsert> = {};
    if (!existing.identityEditedBy && profile.displayName && profile.displayName !== existing.displayName) {
      changes.displayName = profile.displayName;
    }
    if (!existing.identityEditedBy && profile.email && profile.email !== existing.email) {
      changes.email = profile.email;
    }
    if (Object.keys(changes).length === 0) return existing;
    const [updated] = await db
      .update(appUsersTable)
      .set(changes)
      .where(eq(appUsersTable.id, existing.id))
      .returning();
    return updated;
  }

  return db.transaction(async (tx) => {
    // Serialize first-login provisioning and administrator recovery so a
    // concurrent sign-in cannot create two active administrators.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(68434921)`);
    const [current] = await tx
      .select()
      .from(appUsersTable)
      .where(eq(appUsersTable.clerkUserId, clerkUserId))
      .for("update");

    const [activeAdmin] = await tx
      .select({ id: appUsersTable.id })
      .from(appUsersTable)
      .where(and(eq(appUsersTable.role, "admin"), eq(appUsersTable.status, "active")))
      .limit(1);
    const shouldRestoreAdmin = canRecover && !activeAdmin;

    if (current) {
      const changes: Partial<typeof appUsersTable.$inferInsert> = {};
      if (!current.identityEditedBy && profile.displayName && profile.displayName !== current.displayName) {
        changes.displayName = profile.displayName;
      }
      if (!current.identityEditedBy && profile.email && profile.email !== current.email) {
        changes.email = profile.email;
      }
      if (shouldRestoreAdmin) {
        changes.role = "admin";
        changes.status = "active";
      }
      if (Object.keys(changes).length === 0) return current;
      const [updated] = await tx
        .update(appUsersTable)
        .set(changes)
        .where(eq(appUsersTable.id, current.id))
        .returning();
      return updated;
    }

    const [userCount] = await tx.select({ count: count() }).from(appUsersTable);
    const isFirstUser = Number(userCount?.count ?? 0) === 0;
    const [created] = await tx
      .insert(appUsersTable)
      .values({
        clerkUserId,
        displayName: profile.displayName,
        email: profile.email,
        role: isFirstUser || shouldRestoreAdmin ? "admin" : "lawyer",
        status: isFirstUser || shouldRestoreAdmin ? "active" : "pending",
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
  let email = emailClaim(claims);
  let verifiedRecoveryEmail: string | null = null;
  const recoveryEmail = process.env.ADMIN_RECOVERY_EMAIL?.trim().toLowerCase();
  if (recoveryEmail) {
    try {
      const clerkUser = await clerkClient.users.getUser(auth.userId);
      const primaryEmail = clerkUser.emailAddresses.find(
        (address) => address.id === clerkUser.primaryEmailAddressId,
      );
      email = email ?? primaryEmail?.emailAddress ?? clerkUser.emailAddresses[0]?.emailAddress ?? null;
      verifiedRecoveryEmail =
        clerkUser.emailAddresses.find(
          (address) =>
            address.emailAddress.trim().toLowerCase() === recoveryEmail &&
            address.verification?.status === "verified",
        )?.emailAddress ?? null;
    } catch (error) {
      req.log.warn({ error }, "Unable to resolve Clerk email for administrator recovery");
    }
  }

  req.appUser = await ensureLocalUser(auth.userId, {
    displayName,
    email,
    verifiedRecoveryEmail,
  });
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
