import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import {
  agentSettingsTable,
  caseStagesTable,
  clientsTable,
  db,
  secretaryRemindersTable,
  type SecretaryReminderType,
} from "@workspace/db";
import { logger } from "./logger";

export const AUTOMATIC_SECRETARY_CHECK_INTERVAL_MINUTES = 15;

const automaticCheckIntervalMs = AUTOMATIC_SECRETARY_CHECK_INTERVAL_MINUTES * 60 * 1000;
const schedulerPollIntervalMs = 60 * 1000;
let schedulerTimer: NodeJS.Timeout | undefined;

type ReminderCandidate = {
  clientId: number;
  stageId: number;
  type: SecretaryReminderType;
  controlDate: Date | null;
  dedupeKey: string;
};

function getReminderCandidate(
  stage: {
    clientId: number;
    stageId: number;
    isUrgent: boolean;
    controlDate: Date | null;
    nextControlDate: Date | null;
  },
  now: Date,
): ReminderCandidate | null {
  const dates = [stage.controlDate, stage.nextControlDate].filter(
    (date): date is Date => date !== null,
  );
  const overdue = dates
    .filter((date) => date.getTime() < now.getTime())
    .sort((a, b) => a.getTime() - b.getTime())[0];

  let type: SecretaryReminderType;
  let controlDate: Date | null;
  if (overdue) {
    type = "overdue";
    controlDate = overdue;
  } else if (stage.isUrgent) {
    type = "urgent";
    controlDate = dates.sort((a, b) => a.getTime() - b.getTime())[0] ?? null;
  } else {
    const upcoming = dates
      .filter((date) => date.getTime() >= now.getTime())
      .filter((date) => date.getTime() <= now.getTime() + 7 * 24 * 60 * 60 * 1000)
      .sort((a, b) => a.getTime() - b.getTime())[0];
    if (!upcoming) return null;
    type = "upcoming";
    controlDate = upcoming;
  }

  const dateKey = controlDate?.toISOString() ?? "none";
  return {
    clientId: stage.clientId,
    stageId: stage.stageId,
    type,
    controlDate,
    dedupeKey: `${stage.stageId}:${type}:${dateKey}`,
  };
}

export async function runAutomaticSecretaryCheck(force = false): Promise<void> {
  const now = new Date();
  const shouldRun = await db.transaction(async (tx) => {
    const [settings] = await tx
      .select({
        enabled: agentSettingsTable.autoSecretaryEnabled,
        lastRunAt: agentSettingsTable.lastSecretaryRunAt,
      })
      .from(agentSettingsTable)
      .where(eq(agentSettingsTable.id, 1))
      .for("update");

    if (!settings?.enabled) return false;
    if (
      !force &&
      settings.lastRunAt &&
      now.getTime() - settings.lastRunAt.getTime() < automaticCheckIntervalMs
    ) {
      return false;
    }

    await tx
      .update(agentSettingsTable)
      .set({ lastSecretaryRunAt: now })
      .where(eq(agentSettingsTable.id, 1));
    return true;
  });
  if (!shouldRun) return;

  const stages = await db
    .select({
      clientId: clientsTable.id,
      stageId: caseStagesTable.id,
      isUrgent: caseStagesTable.isUrgent,
      controlDate: caseStagesTable.controlDate,
      nextControlDate: caseStagesTable.nextControlDate,
    })
    .from(caseStagesTable)
    .innerJoin(clientsTable, eq(caseStagesTable.clientId, clientsTable.id))
    .where(
      and(
        eq(clientsTable.status, "in_progress"),
        eq(caseStagesTable.isCompleted, false),
      ),
    );

  const candidates = stages
    .map((stage) => getReminderCandidate(stage, now))
    .filter((candidate): candidate is ReminderCandidate => candidate !== null);
  const currentKeys = new Set(candidates.map((candidate) => candidate.dedupeKey));
  const existingActive = await db
    .select({
      id: secretaryRemindersTable.id,
      dedupeKey: secretaryRemindersTable.dedupeKey,
    })
    .from(secretaryRemindersTable)
    .where(isNull(secretaryRemindersTable.resolvedAt));

  const staleIds = existingActive
    .filter((reminder) => !currentKeys.has(reminder.dedupeKey))
    .map((reminder) => reminder.id);
  if (staleIds.length > 0) {
    await db
      .update(secretaryRemindersTable)
      .set({ resolvedAt: now })
      .where(inArray(secretaryRemindersTable.id, staleIds));
  }

  if (candidates.length > 0) {
    await db
      .insert(secretaryRemindersTable)
      .values(candidates)
      .onConflictDoUpdate({
        target: secretaryRemindersTable.dedupeKey,
        set: { resolvedAt: null },
      });
  }
}

export function startAutomaticSecretaryScheduler(): void {
  if (schedulerTimer) return;
  const runSafely = () => {
    void runAutomaticSecretaryCheck().catch((err) => {
      logger.error({ err }, "Automatic secretary check failed");
    });
  };
  runSafely();
  schedulerTimer = setInterval(runSafely, schedulerPollIntervalMs);
  schedulerTimer.unref();
}

export async function listActiveSecretaryReminders() {
  return db
    .select({
      id: secretaryRemindersTable.id,
      clientId: secretaryRemindersTable.clientId,
      clientName: clientsTable.name,
      stageId: secretaryRemindersTable.stageId,
      stageName: caseStagesTable.name,
      type: secretaryRemindersTable.type,
      controlDate: secretaryRemindersTable.controlDate,
      createdAt: secretaryRemindersTable.createdAt,
    })
    .from(secretaryRemindersTable)
    .innerJoin(clientsTable, eq(secretaryRemindersTable.clientId, clientsTable.id))
    .innerJoin(caseStagesTable, eq(secretaryRemindersTable.stageId, caseStagesTable.id))
    .where(
      and(
        isNull(secretaryRemindersTable.resolvedAt),
        eq(clientsTable.status, "in_progress"),
        eq(caseStagesTable.isCompleted, false),
      ),
    )
    .orderBy(desc(secretaryRemindersTable.createdAt))
    .limit(100);
}
