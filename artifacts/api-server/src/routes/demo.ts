import { randomBytes } from "node:crypto";
import { clerkClient } from "@clerk/express";
import { and, eq } from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  appUsersTable,
  caseStagesTable,
  clientsTable,
  db,
} from "@workspace/db";

const router: IRouter = Router();
const DEMO_EMAIL = "demo.lawyer@example.com";
const DAY = 24 * 60 * 60 * 1000;

function dateFromNow(days: number): Date {
  return new Date(Date.now() + days * DAY);
}

type DemoStage = {
  name: string;
  days: number;
  content: string;
  result?: string;
  outcome?: "success" | "unsuccessful" | "partial";
  isCompleted: boolean;
  isUrgent?: boolean;
  controlDays?: number;
  nextControlDays?: number;
  failureReasons?: string;
  nextPlans?: string;
};

async function ensureDemoUser(): Promise<number> {
  const clerkUsers = await clerkClient.users.getUserList({
    emailAddress: [DEMO_EMAIL],
    limit: 1,
  });
  let clerkUser = clerkUsers.data[0];
  if (!clerkUser) {
    clerkUser = await clerkClient.users.createUser({
      emailAddress: [DEMO_EMAIL],
      emailAddressIdentificationStatus: ["reserved"],
      firstName: "Юрист-консульт",
      password: randomBytes(48).toString("base64url"),
    });
  }

  return db.transaction(async (tx) => {
    const [admin] = await tx
      .select({ id: appUsersTable.id })
      .from(appUsersTable)
      .where(and(eq(appUsersTable.role, "admin"), eq(appUsersTable.status, "active")))
      .limit(1);
    if (!admin) {
      throw new Error("Create or restore an active administrator before seeding demo data");
    }

    const [existing] = await tx
      .select()
      .from(appUsersTable)
      .where(eq(appUsersTable.clerkUserId, clerkUser.id));
    if (existing) {
      if (existing.role !== "lawyer" || existing.status !== "active") {
        throw new Error("The demo account is not an active lawyer; an administrator must review its access");
      }
      return existing.id;
    }

    const [created] = await tx
      .insert(appUsersTable)
      .values({
        clerkUserId: clerkUser.id,
        displayName: "Юрист-консульт",
        email: DEMO_EMAIL,
        jobTitle: "Юрист-консульт",
        role: "lawyer",
        status: "active",
      })
      .returning({ id: appUsersTable.id });
    return created.id;
  });
}

async function ensureDemoCase(
  lawyerId: number,
  name: string,
  phone: string,
  status: "new" | "in_progress" | "closed",
  createdDaysAgo: number,
  stages: DemoStage[],
  closedDaysAgo?: number,
): Promise<void> {
  await db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(clientsTable)
      .where(and(eq(clientsTable.name, name), eq(clientsTable.assignedToUserId, lawyerId)))
      .limit(1);
    const client =
      existing ??
      (
        await tx
          .insert(clientsTable)
          .values({
            name,
            phone,
            status,
            assignedToUserId: lawyerId,
            createdAt: dateFromNow(-createdDaysAgo),
            closedAt: closedDaysAgo === undefined ? null : dateFromNow(-closedDaysAgo),
          })
          .returning()
      )[0];

    const existingStages = await tx
      .select({ name: caseStagesTable.name })
      .from(caseStagesTable)
      .where(eq(caseStagesTable.clientId, client.id));
    const knownStageNames = new Set(existingStages.map((stage) => stage.name));
    const missingStages = stages.filter((stage) => !knownStageNames.has(stage.name));
    if (missingStages.length === 0) return;

    await tx.insert(caseStagesTable).values(
      missingStages.map((stage) => {
        const stageDate = dateFromNow(stage.days);
        const closedAt = stage.isCompleted ? stageDate : null;
        return {
          clientId: client.id,
          name: stage.name,
          stageDate,
          content: stage.content,
          result: stage.result ?? null,
          outcome: stage.outcome ?? null,
          isCompleted: stage.isCompleted,
          isUrgent: stage.isUrgent ?? false,
          failureReasons: stage.failureReasons ?? null,
          nextPlans: stage.nextPlans ?? null,
          controlDate: stage.controlDays === undefined ? null : dateFromNow(stage.controlDays),
          nextControlDate:
            stage.nextControlDays === undefined ? null : dateFromNow(stage.nextControlDays),
          closedAt,
        };
      }),
    );
  });
}

async function seedDemoData(lawyerId: number): Promise<void> {
  await ensureDemoCase(
    lawyerId,
    "Демо — Консультация по договору аренды",
    "+7 900 000-00-01",
    "new",
    1,
    [
      {
        name: "Проверить договор и документы клиента",
        days: 2,
        content: "Сверить условия аренды, сроки, порядок расторжения и приложения.",
        isCompleted: false,
        controlDays: 3,
        nextControlDays: 5,
      },
      {
        name: "Подготовить предварительное заключение",
        days: 5,
        content: "Сформулировать риски, варианты действий и вопросы для клиента.",
        isCompleted: false,
        controlDays: 6,
        nextControlDays: 8,
      },
    ],
  );

  await ensureDemoCase(
    lawyerId,
    "Демо — Взыскание долга за поставку",
    "+7 900 000-00-02",
    "in_progress",
    24,
    [
      {
        name: "Изучить договор и первичные документы",
        days: -20,
        content: "Проверены договор поставки, накладные и переписка сторон.",
        result: "Документы подтверждают поставку и размер основного долга.",
        outcome: "success",
        isCompleted: true,
      },
      {
        name: "Рассчитать задолженность и неустойку",
        days: -17,
        content: "Сверить оплаты и рассчитать неустойку по условиям договора.",
        result: "Расчёт подтверждён выписками и актом сверки.",
        outcome: "success",
        isCompleted: true,
      },
      {
        name: "Направить претензию должнику",
        days: -13,
        content: "Претензия отправлена заказным письмом и по электронной почте.",
        result: "Добровольная оплата не поступила.",
        outcome: "unsuccessful",
        failureReasons: "Должник не ответил на претензию в установленный срок.",
        isCompleted: true,
      },
      {
        name: "Подготовить исковое заявление",
        days: -8,
        content: "Подготовлены иск, расчёт требований и комплект приложений.",
        result: "Иск принят к подаче после проверки комплекта доказательств.",
        outcome: "partial",
        isCompleted: true,
      },
      {
        name: "Подать иск и проверить принятие судом",
        days: 0,
        content: "Текущий этап: направить иск и проверить карточку дела.",
        isCompleted: false,
        isUrgent: true,
        controlDays: 1,
        nextControlDays: 2,
      },
      {
        name: "Подготовить позицию к предварительному заседанию",
        days: 4,
        content: "Собрать оригиналы документов и подготовить ответы на возможные вопросы суда.",
        isCompleted: false,
        controlDays: 5,
        nextControlDays: 7,
      },
    ],
  );

  await ensureDemoCase(
    lawyerId,
    "Демо — Спор о защите прав потребителя",
    "+7 900 000-00-03",
    "closed",
    38,
    [
      {
        name: "Проверить договор, чек и переписку",
        days: -31,
        content: "Изучены договор, чек, претензия и ответы продавца.",
        result: "Документы подтвердили дату покупки и обращение клиента.",
        outcome: "success",
        isCompleted: true,
      },
      {
        name: "Получить добровольное исполнение требований",
        days: -24,
        content: "Продавцу направлено требование о возврате денежных средств.",
        result: "Продавец отказал в добровольном возврате.",
        outcome: "unsuccessful",
        failureReasons: "Продавец не признал недостаток товара.",
        isCompleted: true,
      },
      {
        name: "Подготовить и подать иск",
        days: -16,
        content: "Иск подан с доказательствами покупки и заключением эксперта.",
        result: "Требования удовлетворены частично.",
        outcome: "partial",
        isCompleted: true,
      },
      {
        name: "Итог дела",
        days: -3,
        content: "Дело закрыто. Журнал доступен только для чтения.",
        result: "Клиент получил частичный возврат стоимости и компенсацию расходов.",
        outcome: "partial",
        nextPlans: "Проверить исполнение решения. При задержке — обратиться за исполнительным листом и предъявить его к исполнению.",
        isCompleted: true,
      },
    ],
    3,
  );
}

router.post("/auth/demo-sign-in", async (req, res): Promise<void> => {
  if (process.env.NODE_ENV !== "development" || !process.env.CLERK_SECRET_KEY?.startsWith("sk_test_")) {
    res.sendStatus(404);
    return;
  }

  try {
    const lawyerId = await ensureDemoUser();
    await seedDemoData(lawyerId);
    const [demoUser] = await db
      .select({ clerkUserId: appUsersTable.clerkUserId })
      .from(appUsersTable)
      .where(eq(appUsersTable.id, lawyerId))
      .limit(1);
    if (!demoUser) throw new Error("Demo account was not created");
    const signInToken = await clerkClient.signInTokens.createSignInToken({
      userId: demoUser.clerkUserId,
      expiresInSeconds: 60,
    });
    res.json({ email: DEMO_EMAIL, url: signInToken.url, expiresInSeconds: 60 });
  } catch (error) {
    req.log.error({ error }, "Unable to prepare demo lawyer account");
    res.status(503).json({
      error: error instanceof Error ? error.message : "Unable to prepare demo sign-in",
    });
  }
});

export default router;
