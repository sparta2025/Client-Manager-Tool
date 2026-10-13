import { eq } from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  agentSettingsTable,
  db,
} from "@workspace/db";
import {
  GetAgentSettingsResponse,
  ListSecretaryRemindersResponse,
  UpdateAgentSettingsBody,
  UpdateAgentSettingsResponse,
} from "@workspace/api-zod";
import {
  AUTOMATIC_SECRETARY_CHECK_INTERVAL_MINUTES,
  listActiveSecretaryReminders,
  runAutomaticSecretaryCheck,
} from "../lib/automatic-secretary";
import { requireAdministrator } from "../middlewares/auth";

const router: IRouter = Router();

async function ensureAgentSettings() {
  await db
    .insert(agentSettingsTable)
    .values({ id: 1 })
    .onConflictDoNothing({ target: agentSettingsTable.id });
  const [settings] = await db
    .select()
    .from(agentSettingsTable)
    .where(eq(agentSettingsTable.id, 1));
  return settings;
}

function responseSettings(settings: NonNullable<Awaited<ReturnType<typeof ensureAgentSettings>>>) {
  return {
    autoSecretaryEnabled: settings.autoSecretaryEnabled,
    checkIntervalMinutes: AUTOMATIC_SECRETARY_CHECK_INTERVAL_MINUTES,
    lastRunAt: settings.lastSecretaryRunAt,
    updatedAt: settings.updatedAt,
  };
}

router.get("/agents/settings", async (_req, res): Promise<void> => {
  const settings = await ensureAgentSettings();
  res.json(GetAgentSettingsResponse.parse(responseSettings(settings)));
});

router.patch("/agents/settings", requireAdministrator, async (req, res): Promise<void> => {
  const parsed = UpdateAgentSettingsBody.safeParse(req.body);
  if (!parsed.success) {
    req.log.warn({ errors: parsed.error.message }, "Invalid agent settings request");
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  await db
    .insert(agentSettingsTable)
    .values({ id: 1, autoSecretaryEnabled: parsed.data.autoSecretaryEnabled })
    .onConflictDoUpdate({
      target: agentSettingsTable.id,
      set: { autoSecretaryEnabled: parsed.data.autoSecretaryEnabled },
    });

  if (parsed.data.autoSecretaryEnabled) {
    await runAutomaticSecretaryCheck(true);
  }

  const settings = await ensureAgentSettings();
  res.json(UpdateAgentSettingsResponse.parse(responseSettings(settings)));
});

router.get("/agents/secretary/reminders", async (req, res): Promise<void> => {
  const settings = await ensureAgentSettings();
  if (settings.autoSecretaryEnabled) {
    await runAutomaticSecretaryCheck();
  }

  const reminders = settings.autoSecretaryEnabled
    ? await listActiveSecretaryReminders(req.appUser!)
    : [];
  res.json(
    ListSecretaryRemindersResponse.parse({
      autoSecretaryEnabled: settings.autoSecretaryEnabled,
      lastRunAt: settings.lastSecretaryRunAt,
      reminders,
    }),
  );
});

export default router;
