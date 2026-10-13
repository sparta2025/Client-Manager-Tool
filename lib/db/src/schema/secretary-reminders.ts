import { pgTable, serial, integer, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { clientsTable } from "./clients";
import { caseStagesTable } from "./case-stages";

export type SecretaryReminderType = "overdue" | "urgent" | "upcoming";

export const secretaryRemindersTable = pgTable(
  "secretary_reminders",
  {
    id: serial("id").primaryKey(),
    clientId: integer("client_id")
      .notNull()
      .references(() => clientsTable.id, { onDelete: "cascade" }),
    stageId: integer("stage_id")
      .notNull()
      .references(() => caseStagesTable.id, { onDelete: "cascade" }),
    type: text("type").$type<SecretaryReminderType>().notNull(),
    controlDate: timestamp("control_date", { withTimezone: true }),
    dedupeKey: text("dedupe_key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  },
  (table) => [uniqueIndex("secretary_reminders_dedupe_key_unique").on(table.dedupeKey)],
);
