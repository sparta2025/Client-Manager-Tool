import { pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

export type TeamRole = "admin" | "lawyer" | "assistant";
export type TeamMemberStatus = "active" | "pending" | "disabled";

export const appUsersTable = pgTable(
  "app_users",
  {
    id: serial("id").primaryKey(),
    clerkUserId: text("clerk_user_id").notNull(),
    displayName: text("display_name"),
    email: text("email"),
    jobTitle: text("job_title"),
    phone: text("phone"),
    profileEditedAt: timestamp("profile_edited_at", { withTimezone: true }),
    profileEditedBy: text("profile_edited_by").$type<"admin" | "user">(),
    identityEditedAt: timestamp("identity_edited_at", { withTimezone: true }),
    identityEditedBy: text("identity_edited_by").$type<"admin" | "user">(),
    role: text("role").$type<TeamRole>().notNull().default("lawyer"),
    status: text("status").$type<TeamMemberStatus>().notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [uniqueIndex("app_users_clerk_user_id_unique").on(table.clerkUserId)],
);

export type AppUser = typeof appUsersTable.$inferSelect;
