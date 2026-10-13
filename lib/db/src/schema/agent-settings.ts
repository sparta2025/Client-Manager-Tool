import { boolean, integer, pgTable, timestamp } from "drizzle-orm/pg-core";

export const agentSettingsTable = pgTable("agent_settings", {
  id: integer("id").primaryKey().default(1),
  autoSecretaryEnabled: boolean("auto_secretary_enabled").notNull().default(false),
  lastSecretaryRunAt: timestamp("last_secretary_run_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});
