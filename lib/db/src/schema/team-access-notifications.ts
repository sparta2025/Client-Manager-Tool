import { integer, pgTable, serial, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { appUsersTable } from "./app-users";

export const teamAccessNotificationsTable = pgTable(
  "team_access_notifications",
  {
    id: serial("id").primaryKey(),
    requesterId: integer("requester_id")
      .notNull()
      .references(() => appUsersTable.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("team_access_notifications_requester_id_unique").on(table.requesterId)],
);

export type TeamAccessNotification = typeof teamAccessNotificationsTable.$inferSelect;
