import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, clientsTable, caseStagesTable } from "@workspace/db";
import {
  CreatePreliminaryPlanParams,
  CreatePreliminaryPlanResponse,
  GetSecretaryReviewParams,
  GetSecretaryReviewResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();
const MODEL = "openai/gpt-oss-20b:free";
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

type ChatMessage = {
  role: "system" | "user";
  content: string;
};

async function askOpenRouter(messages: ChatMessage[], attempt = 0): Promise<unknown> {
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
        model: MODEL,
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
        return askOpenRouter(messages, attempt + 1);
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
      return askOpenRouter(messages, attempt + 1);
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
      isCompleted: caseStagesTable.isCompleted,
    })
    .from(caseStagesTable)
    .where(eq(caseStagesTable.clientId, client.id));

  const now = new Date();
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
            "Используй русский язык.",
          ],
        }),
      },
    ]);

    const result = CreatePreliminaryPlanResponse.parse({
      clientId: client.id,
      model: MODEL,
      ...(generated as Record<string, unknown>),
    });
    res.json(result);
  } catch (error) {
    res.status(502).json({ error: `Не удалось составить план: ${errorMessage(error)}` });
  }
});

router.get("/ai/clients/:clientId/secretary-review", async (req, res): Promise<void> => {
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
    ]);

    const result = GetSecretaryReviewResponse.parse({
      clientId: client.id,
      model: MODEL,
      ...(generated as Record<string, unknown>),
    });
    res.json(result);
  } catch (error) {
    res.status(502).json({ error: `Не удалось получить напоминания: ${errorMessage(error)}` });
  }
});

export default router;