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
import { requireAdministrator } from "../middlewares/auth";

const router: IRouter = Router();

function toTeamMember(user: typeof appUsersTable.$inferSelect) {
  return {
    id: user.id,
    displayName: user.displayName,
    email: user.email,
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

router.get("/team/members", requireAdministrator, async (_req, res): Promise<void> => {
  const members = await db.select().from(appUsersTable).orderBy(appUsersTable.createdAt);
  res.json(ListTeamMembersResponse.parse(members.map(toTeamMember)));
});

router.patch("/team/members/:id", requireAdministrator, async (req, res): Promise<void> => {
  const params = UpdateTeamMemberParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateTeamMemberBody.safeParse(req.body);
  if (!parsed.success || Object.keys(parsed.data ?? {}).length === 0) {
    res.status(400).json({ error: parsed.success ? "Provide a role or status" : parsed.error.message });
    return;
  }

  const result = await db.transaction(async (tx) => {
    // Keep concurrent role changes from removing every active administrator.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(68434922)`);
    const [existing] = await tx
      .select()
      .from(appUsersTable)
      .where(eq(appUsersTable.id, params.data.id))
      .for("update");
    if (!existing) return { kind: "not-found" as const };

    const nextRole = parsed.data.role ?? existing.role;
    const nextStatus = parsed.data.status ?? existing.status;
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
      .set(parsed.data)
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

export default router;
