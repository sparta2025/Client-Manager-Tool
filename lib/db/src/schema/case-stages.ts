import { pgTable, text, serial, timestamp, boolean, integer } from "drizzle-orm/pg-core";
import { clientsTable } from "./clients";

export const caseStagesTable = pgTable("case_stages", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id")
    .notNull()
    .references(() => clientsTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  stageDate: timestamp("stage_date", { withTimezone: true }).notNull().defaultNow(),
  content: text("content"),
  result: text("result"),
  isCompleted: boolean("is_completed").notNull().default(false),
  isUrgent: boolean("is_urgent").notNull().default(false),
  failureReasons: text("failure_reasons"),
  nextPlans: text("next_plans"),
  controlDate: timestamp("control_date", { withTimezone: true }),
  nextControlDate: timestamp("next_control_date", { withTimezone: true }),
  closedAt: timestamp("closed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type CaseStage = typeof caseStagesTable.$inferSelect;
export type InsertCaseStage = typeof caseStagesTable.$inferInsert;
