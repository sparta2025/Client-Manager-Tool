import { Router, type IRouter, type Request, type Response } from "express";
import { desc, eq } from "drizzle-orm";
import { db, clientsTable, caseStagesTable } from "@workspace/db";
import {
  CreatePreliminaryPlanParams,
  CreatePreliminaryPlanBody,
  CreatePreliminaryPlanResponse,
  GetSecretaryReviewParams,
  GetSecretaryReviewResponse,
  SuggestNextStepParams,
  SuggestNextStepResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();
const DEFAULT_MODEL = process.env.OPENROUTER_MODEL ?? "openrouter/free";
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const OPENROUTER_MODELS_URL = "https://openrouter.ai/api/v1/models";
const MODEL_ID_PATTERN = /^[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*(?::[a-z0-9][a-z0-9._-]*)?$/i;

type ChatMessage = {
  role: "system" | "user";
  content: string;
};

type AiModel = {
  id: string;
  name: string;
  provider: string;
  isFree: boolean;
};

type OpenRouterModel = {
  id?: string;
  name?: string;
  pricing?: {
    prompt?: string | number;
    completion?: string | number;
  };
  architecture?: {
    output_modalities?: string[];
  };
};

let modelsCache: { expiresAt: number; models: AiModel[] } | null = null;

function resolveModel(value: unknown): string {
  return typeof value === "string" && MODEL_ID_PATTERN.test(value) ? value : DEFAULT_MODEL;
}

function resolveBodyModel(body: unknown): string {
  const parsed = CreatePreliminaryPlanBody.safeParse(body ?? {});
  return resolveModel(parsed.success ? parsed.data.model : undefined);
}

async function askOpenRouter(messages: ChatMessage[], model: string, attempt = 0): Promise<unknown> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY is not configured");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60_000);

  try {
    const response = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://replit.com",
        "X-Title": "Lawyer CRM",
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        max_tokens: 8192,
        messages,
      }),
      signal: controller.signal,
    });

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      error?: { message?: string };
    };
    if (!response.ok) {
      if (attempt === 0 && (response.status === 408 || response.status === 429 || response.status >= 500)) {
        await new Promise((resolve) => setTimeout(resolve, 750));
        return askOpenRouter(messages, model, attempt + 1);
      }
      throw new Error(payload.error?.message || `OpenRouter returned ${response.status}`);
    }

    const content = payload.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error("OpenRouter returned an empty response");
    }

    const normalized = content
      .trim()
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/, "");
    return JSON.parse(normalized) as unknown;
  } catch (error) {
    if (attempt === 0 && !(error instanceof Error && error.name === "AbortError")) {
      await new Promise((resolve) => setTimeout(resolve, 750));
      return askOpenRouter(messages, model, attempt + 1);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function formatStageDate(value: Date | null): string | null {
  return value?.toISOString() ?? null;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown AI error";
}

router.get("/ai/models", async (_req, res): Promise<void> => {
  const now = Date.now();
  if (modelsCache && modelsCache.expiresAt > now) {
    res.json(modelsCache.models);
    return;
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    res.status(503).json({ error: "OPENROUTER_API_KEY is not configured" });
    return;
  }

  try {
    const response = await fetch(OPENROUTER_MODELS_URL, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "HTTP-Referer": "https://replit.com",
        "X-Title": "Lawyer CRM",
      },
    });
    const payload = (await response.json()) as { data?: OpenRouterModel[] };
    if (!response.ok) {
      throw new Error(`OpenRouter returned ${response.status}`);
    }

    const freeModels = (payload.data ?? [])
      .filter((model) => {
        const outputModalities = model.architecture?.output_modalities ?? ["text"];
        return (
          typeof model.id === "string" &&
          outputModalities.includes("text") &&
          String(model.pricing?.prompt ?? "") === "0" &&
          String(model.pricing?.completion ?? "") === "0"
        );
      })
      .map((model) => ({
        id: model.id!,
        name: model.name?.trim() || model.id!,
        provider: model.id!.split("/")[0],
        isFree: true,
      }));

    const models: AiModel[] = [
      {
        id: "openrouter/free",
        name: "OpenRouter Free Models Router",
        provider: "OpenRouter",
        isFree: true,
      },
      ...freeModels.filter((model) => model.id !== "openrouter/free"),
    ];

    if (DEFAULT_MODEL !== "openrouter/free" && !models.some((model) => model.id === DEFAULT_MODEL)) {
      models.unshift({
        id: DEFAULT_MODEL,
        name: `Настроенная модель (${DEFAULT_MODEL})`,
        provider: DEFAULT_MODEL.split("/")[0],
        isFree: false,
      });
    }

    modelsCache = { expiresAt: now + 5 * 60 * 1000, models };
    res.json(models);
  } catch (error) {
    res.status(503).json({ error: `Не удалось получить список моделей: ${errorMessage(error)}` });
  }
});

router.post("/ai/clients/:clientId/preliminary-plan", async (req, res): Promise<void> => {
  const params = CreatePreliminaryPlanParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [client] = await db
    .select()
    .from(clientsTable)
    .where(eq(clientsTable.id, params.data.clientId));
  if (!client) {
    res.status(404).json({ error: "Client not found" });
    return;
  }
  if (client.status !== "new") {
    res.status(409).json({ error: "Preliminary planning is available for new clients only" });
    return;
  }

  const existingStages = await db
    .select({
      name: caseStagesTable.name,
      stageDate: caseStagesTable.stageDate,
      content: caseStagesTable.content,
      result: caseStagesTable.result,
      isCompleted: caseStagesTable.isCompleted,
      isUrgent: caseStagesTable.isUrgent,
      controlDate: caseStagesTable.controlDate,
      nextControlDate: caseStagesTable.nextControlDate,
      nextPlans: caseStagesTable.nextPlans,
    })
    .from(caseStagesTable)
    .where(eq(caseStagesTable.clientId, client.id));

  const now = new Date();
  const model = resolveBodyModel(req.body);
  try {
    const generated = await askOpenRouter([
      {
        role: "system",
        content:
          "Ты Агент-помощник юриста. Составь практичный предварительный журнал нового юридического дела. " +
          "Отвечай только валидным JSON без markdown и без пояснений вне JSON. " +
          "Все даты должны быть ISO 8601 с часовым поясом. Не выдумывай факты о деле.",
      },
      {
        role: "user",
        content: JSON.stringify({
          task: "Составить предварительный план работы для нового обращения.",
          client: {
            name: client.name,
            createdAt: client.createdAt.toISOString(),
          },
          currentDate: now.toISOString(),
          existingStages,
          outputShape: {
            introduction: "Короткое резюме исходной рабочей гипотезы и ближайшего шага",
            stages: [
              {
                name: "Название этапа",
                stageDate: "Ориентировочная дата начала",
                content: "Приблизительное начальное содержание",
                result: null,
                isUrgent: false,
                controlDate: "Дата проверки текущего этапа или null",
                nextControlDate: "Дата проверки следующего шага или null",
                nextPlans: "Что сделать после этапа или null",
              },
            ],
          },
          requirements: [
            "Предложи от 3 до 6 последовательных этапов.",
            "Планируй даты в ближайшие 30 дней от текущей даты.",
            "Срочность ставь только этапам с очевидным риском пропуска срока.",
            "Используй содержание первичного обращения, сообщённую клиентом контрольную дату и флаг срочности как исходные условия.",
            "Не дублируй первичное обращение отдельным плановым этапом.",
            "Не меняй и не теряй уже сообщённые контрольные сроки; не придумывай обязательные юридические сроки.",
            "Используй русский язык.",
          ],
        }),
      },
    ], model);

    const result = CreatePreliminaryPlanResponse.parse({
      clientId: client.id,
      model,
      ...(generated as Record<string, unknown>),
    });
    res.json(result);
  } catch (error) {
    res.status(502).json({ error: `Не удалось составить план: ${errorMessage(error)}` });
  }
});

router.post("/ai/clients/:clientId/next-step", async (req, res): Promise<void> => {
  const params = SuggestNextStepParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [client] = await db
    .select()
    .from(clientsTable)
    .where(eq(clientsTable.id, params.data.clientId));
  if (!client) {
    res.status(404).json({ error: "Client not found" });
    return;
  }
  if (client.status !== "in_progress") {
    res.status(409).json({ error: "Next-step suggestions are available for in-progress clients only" });
    return;
  }

  const stages = await db
    .select()
    .from(caseStagesTable)
    .where(eq(caseStagesTable.clientId, client.id))
    .orderBy(desc(caseStagesTable.stageDate))
    .limit(12);
  if (stages.length === 0) {
    res.status(409).json({ error: "Add a journal entry before requesting a next-step suggestion" });
    return;
  }

  const currentStage = stages.find((stage) => !stage.isCompleted) ?? stages[0];
  const model = resolveBodyModel(req.body);

  try {
    const generated = await askOpenRouter([
      {
        role: "system",
        content:
          "Ты помощник юриста по ведению уже начатого дела. Анализируй только переданные записи журнала, " +
          "не выдумывай факты, документы, действия сторон или процессуальные сроки. " +
          "Отвечай только валидным JSON без markdown. Предложи один следующий этап, который юрист должен проверить.",
      },
      {
        role: "user",
        content: JSON.stringify({
          task: "Кратко оценить ход дела и предложить конкретный следующий этап.",
          client: { name: client.name, status: client.status },
          currentDate: new Date().toISOString(),
          currentStageName: currentStage.name,
          journal: stages.reverse().map((stage) => ({
            name: stage.name,
            stageDate: stage.stageDate.toISOString(),
            content: stage.content,
            result: stage.result,
            isCompleted: stage.isCompleted,
            isUrgent: stage.isUrgent,
            controlDate: formatStageDate(stage.controlDate),
            nextControlDate: formatStageDate(stage.nextControlDate),
            nextPlans: stage.nextPlans,
          })),
          outputShape: {
            summary: "Краткий вывод по последним записям журнала",
            proposedStage: {
              name: "Название одного следующего этапа",
              stageDate: "Предполагаемая дата начала в ISO 8601",
              content: "Конкретное содержание предлагаемой работы",
              isUrgent: false,
              controlDate: "Дата контроля только при наличии оснований или null",
              nextControlDate: "Дата следующего контроля или null",
              nextPlans: "Логичный шаг после предложенного этапа или null",
            },
          },
          requirements: [
            "Учитывай незавершённый этап, его результат, следующие цели, сроки и трудности.",
            "Если в журнале есть первичное обращение, считай его исходными данными, а не выполненной юридической работой.",
            "Не предлагай повторно уже завершённые действия.",
            "Не назначай срочность и юридические сроки без явного основания в записях.",
            "Необоснованные контрольные даты указывай как null.",
            "Пиши по-русски, кратко и по существу.",
          ],
        }),
      },
    ], model);

    const result = SuggestNextStepResponse.parse({
      clientId: client.id,
      model,
      currentStageName: currentStage.name,
      ...(generated as Record<string, unknown>),
    });
    res.json(result);
  } catch (error) {
    res.status(502).json({ error: `Не удалось предложить следующий шаг: ${errorMessage(error)}` });
  }
});

const secretaryReviewHandler = async (req: Request, res: Response): Promise<void> => {
  const params = GetSecretaryReviewParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [client] = await db
    .select()
    .from(clientsTable)
    .where(eq(clientsTable.id, params.data.clientId));
  if (!client) {
    res.status(404).json({ error: "Client not found" });
    return;
  }
  if (client.status === "closed") {
    res.status(409).json({ error: "Closed clients do not receive new reminders" });
    return;
  }

  const stages = await db
    .select()
    .from(caseStagesTable)
    .where(eq(caseStagesTable.clientId, client.id));
  const now = new Date();
  const soonLimit = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const relevantStages = stages.flatMap((stage) => {
    const controlDate = stage.controlDate;
    const nextControlDate = stage.nextControlDate;
    const items: Array<{
      stageId: number;
      stageName: string;
      type: "overdue" | "urgent" | "upcoming";
      controlDate: string | null;
      isUrgent: boolean;
      isCompleted: boolean;
    }> = [];

    if (!stage.isCompleted && controlDate && controlDate < now) {
      items.push({
        stageId: stage.id,
        stageName: stage.name,
        type: "overdue",
        controlDate: formatStageDate(controlDate),
        isUrgent: stage.isUrgent,
        isCompleted: stage.isCompleted,
      });
    } else if (!stage.isCompleted && stage.isUrgent) {
      items.push({
        stageId: stage.id,
        stageName: stage.name,
        type: "urgent",
        controlDate: formatStageDate(controlDate ?? nextControlDate),
        isUrgent: stage.isUrgent,
        isCompleted: stage.isCompleted,
      });
    } else if (!stage.isCompleted && nextControlDate && nextControlDate <= soonLimit) {
      items.push({
        stageId: stage.id,
        stageName: stage.name,
        type: "upcoming",
        controlDate: formatStageDate(nextControlDate),
        isUrgent: stage.isUrgent,
        isCompleted: stage.isCompleted,
      });
    }
    return items;
  });

  try {
    const model = resolveBodyModel(req.body);
    const generated = await askOpenRouter([
      {
        role: "system",
        content:
          "Ты Агент-секретарь юридической практики. По готовым фактам составь короткое и конкретное уведомление для юриста. " +
          "Отвечай только валидным JSON без markdown. Не добавляй этапы, которых нет во входных данных. " +
          "Если список пуст, сообщи, что срочных и ближайших контрольных сроков нет.",
      },
      {
        role: "user",
        content: JSON.stringify({
          task: "Проверить просроченные, срочные и ближайшие контрольные сроки.",
          client: { name: client.name, status: client.status },
          currentDate: now.toISOString(),
          facts: relevantStages,
          outputShape: {
            headline: "Одна короткая фраза для юриста",
            priority: "normal | attention | urgent",
            items: [
              {
                stageId: 0,
                stageName: "Только название из facts",
                type: "overdue | urgent | upcoming",
                message: "Конкретное напоминание, что сделать",
                controlDate: "Дата из facts или null",
                isUrgent: false,
                isCompleted: false,
              },
            ],
          },
          requirements: [
            "Для overdue используй priority urgent.",
            "Для urgent используй priority urgent.",
            "Для upcoming используй priority attention.",
            "Если facts пуст, используй priority normal и items [].",
            "Пиши по-русски, без эмодзи.",
          ],
        }),
      },
    ], model);

    const result = GetSecretaryReviewResponse.parse({
      clientId: client.id,
      model,
      ...(generated as Record<string, unknown>),
    });
    res.json(result);
  } catch (error) {
    res.status(502).json({ error: `Не удалось получить напоминания: ${errorMessage(error)}` });
  }
};

router.get("/ai/clients/:clientId/secretary-review", secretaryReviewHandler);
router.post("/ai/clients/:clientId/secretary-review", secretaryReviewHandler);

export default router;