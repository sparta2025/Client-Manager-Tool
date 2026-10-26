import { and, count, eq, ne, sql } from "drizzle-orm";
import { Router, type IRouter, type Request, type Response } from "express";
import {
  appUsersTable,
  db,
} from "@workspace/db";
import {
  GetCurrentTeamMemberResponse,
  ListTeamMembersResponse,
  UpdateTeamMemberBody,
  UpdateTeamMemberParams,
  UpdateTeamMemberResponse,
} from "@workspace/api-zod";
function toTeamMember(user: typeof appUsersTable.$inferSelect) {
  return {
    id: user.id,
    displayName: user.displayName,
    email: user.email,
    jobTitle: user.jobTitle,
    phone: user.phone,
    profileEditedAt: user.profileEditedAt,
    profileEditedBy: user.profileEditedBy,
    identityEditedAt: user.identityEditedAt,
    identityEditedBy: user.identityEditedBy,
    role: user.role,
    status: user.status,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

export function getCurrentTeamMember(req: Request, res: Response): void {
  if (!req.appUser) {
    res.status(401).json({ error: "Sign-in required" });
    return;
  }
  res.json(GetCurrentTeamMemberResponse.parse(toTeamMember(req.appUser)));
}

export function createTeamRouter(database: typeof db = db): IRouter {
  const router: IRouter = Router();

  router.get("/team/members", async (req, res): Promise<void> => {
    if (!req.appUser) {
      res.status(401).json({ error: "Sign-in required" });
      return;
    }
    const members = req.appUser.role === "admin"
      ? await database.select().from(appUsersTable).orderBy(appUsersTable.createdAt)
      : await database.select().from(appUsersTable)
          .where(eq(appUsersTable.id, req.appUser.id))
          .orderBy(appUsersTable.createdAt);
    res.json(ListTeamMembersResponse.parse(members.map(toTeamMember)));
  });

  router.patch("/team/members/:id", async (req, res): Promise<void> => {
    const params = UpdateTeamMemberParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }

    const currentUser = req.appUser;
    if (!currentUser) {
      res.status(401).json({ error: "Sign-in required" });
      return;
    }
    const isAdministrator = currentUser.role === "admin";
    if (!isAdministrator && currentUser.id !== params.data.id) {
      res.status(403).json({ error: "Users may only edit their own profile" });
      return;
    }

    const parsed = UpdateTeamMemberBody.safeParse(req.body);
    if (!parsed.success || Object.keys(parsed.data ?? {}).length === 0) {
      res.status(400).json({ error: parsed.success ? "Provide profile or access fields" : parsed.error.message });
      return;
    }
    if (!isAdministrator && (parsed.data.role !== undefined || parsed.data.status !== undefined)) {
      res.status(403).json({ error: "Only an administrator can change roles or access" });
      return;
    }

    const updates: Partial<typeof appUsersTable.$inferInsert> = { ...parsed.data };
    const hasProfileChanges =
      parsed.data.displayName !== undefined ||
      parsed.data.email !== undefined ||
      parsed.data.jobTitle !== undefined ||
      parsed.data.phone !== undefined;
    const hasIdentityChanges =
      parsed.data.displayName !== undefined || parsed.data.email !== undefined;
    if (hasProfileChanges) {
      updates.profileEditedBy = isAdministrator ? "admin" : "user";
      updates.profileEditedAt = new Date();
    }
    if (hasIdentityChanges) {
      updates.identityEditedBy = isAdministrator ? "admin" : "user";
      updates.identityEditedAt = new Date();
    }

    const result = await database.transaction(async (tx) => {
      // Keep concurrent role changes from removing every active administrator.
      await tx.execute(sql`SELECT pg_advisory_xact_lock(68434922)`);
      const [existing] = await tx
        .select()
        .from(appUsersTable)
        .where(eq(appUsersTable.id, params.data.id))
        .for("update");
      if (!existing) return { kind: "not-found" as const };

      const nextRole = updates.role ?? existing.role;
      const nextStatus = updates.status ?? existing.status;
      const isDemotingActiveAdmin =
        existing.role === "admin" &&
        existing.status === "active" &&
        (nextRole !== "admin" || nextStatus !== "active");

      if (isDemotingActiveAdmin) {
        const [adminCount] = await tx
          .select({ count: count() })
          .from(appUsersTable)
          .where(
            and(
              eq(appUsersTable.role, "admin"),
              eq(appUsersTable.status, "active"),
              ne(appUsersTable.id, existing.id),
            ),
          );
        if (Number(adminCount?.count ?? 0) === 0) {
          return { kind: "last-active-admin" as const };
        }
      }

      const [updated] = await tx
        .update(appUsersTable)
        .set(updates)
        .where(eq(appUsersTable.id, existing.id))
        .returning();
      return { kind: "updated" as const, member: updated };
    });

    if (result.kind === "not-found") {
      res.status(404).json({ error: "Team member not found" });
      return;
    }
    if (result.kind === "last-active-admin") {
      res.status(409).json({ error: "The last active administrator cannot be removed" });
      return;
    }

    res.json(UpdateTeamMemberResponse.parse(toTeamMember(result.member)));
  });

  return router;
}

export default createTeamRouter();
