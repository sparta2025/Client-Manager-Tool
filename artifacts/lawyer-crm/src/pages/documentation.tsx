import { Link } from "wouter";
import {
  ArrowLeft,
  Bot,
  BookOpen,
  CalendarClock,
  CheckCircle2,
  Database,
  Rocket,
  UsersRound,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const sections = [
  { href: "#overview", label: "О CRM", icon: BookOpen },
  { href: "#workflow", label: "Работа с делом", icon: UsersRound },
  { href: "#ai", label: "AI-помощники", icon: Bot },
  { href: "#deploy", label: "Публикация", icon: Rocket },
];

export default function DocumentationPage() {
  return (
    <div className="min-h-screen bg-background p-6 md:p-12 font-sans text-foreground">
      <div className="max-w-5xl mx-auto space-y-8">
        <header className="border-b border-border pb-8">
          <Button variant="ghost" asChild className="-ml-3 mb-5 text-muted-foreground hover:text-primary">
            <Link href="/">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Вернуться к делам
            </Link>
          </Button>
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <Badge variant="outline" className="mb-3 gap-1.5 rounded-full px-3 py-1">
                <BookOpen className="h-3.5 w-3.5" />
                Справочник CRM
              </Badge>
              <h1 className="text-4xl md:text-5xl font-serif font-medium tracking-tight text-primary">
                Документация
              </h1>
              <p className="text-muted-foreground mt-3 max-w-2xl leading-7">
                Краткое руководство по работе с клиентскими делами, журналом этапов,
                контрольными датами, AI-помощниками и публикацией приложения.
              </p>
            </div>
            <div className="rounded-2xl border border-primary/10 bg-card px-5 py-4 text-sm text-muted-foreground shadow-sm">
              <p className="font-medium text-primary">Быстрый ориентир</p>
              <p className="mt-1">Добавьте дело → внесите этапы → контролируйте сроки.</p>
            </div>
          </div>
        </header>

        <nav aria-label="Разделы документации" className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {sections.map(({ href, label, icon: Icon }) => (
            <a
              key={href}
              href={href}
              className="group flex items-center gap-3 rounded-xl border border-border bg-card p-4 text-sm font-medium text-primary shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md"
            >
              <span className="rounded-lg bg-primary/5 p-2 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                <Icon className="h-4 w-4" />
              </span>
              {label}
            </a>
          ))}
        </nav>

        <main className="space-y-8">
          <section id="overview" className="scroll-mt-6">
            <SectionHeading eyebrow="01" title="О CRM" icon={<BookOpen className="h-5 w-5" />} />
            <Card>
              <CardContent className="prose prose-slate max-w-none pt-6 dark:prose-invert">
                <p>
                  CRM юриста помогает вести обращение клиента от первого контакта
                  до закрытия дела. Сводка на главной показывает состояние практики,
                  а карточка клиента объединяет историю, документы по работе и
                  ближайшие задачи.
                </p>
                <p className="mb-0">
                  Статусы дела: <strong>Новый</strong> — обращение ещё не взято в работу,
                  <strong> В работе</strong> — по делу выполняются задачи,
                  <strong> Закрыт</strong> — работа завершена и карточка доступна только для чтения.
                </p>
              </CardContent>
            </Card>
          </section>

          <section id="workflow" className="scroll-mt-6">
            <SectionHeading eyebrow="02" title="Работа с делом" icon={<UsersRound className="h-5 w-5" />} />
            <div className="grid gap-4 md:grid-cols-3">
              <InfoCard
                number="1"
                title="Создайте дело"
                text="Нажмите «Новое дело» на главной странице и заполните ФИО и телефон клиента."
              />
              <InfoCard
                number="2"
                title="Ведите журнал"
                text="В карточке добавляйте этапы, содержание, результаты, планы, срочность и контрольные даты."
              />
              <InfoCard
                number="3"
                title="Закройте дело"
                text="Переведите статус в «Закрыт», когда работа завершена. История останется доступной для чтения."
              />
            </div>
          </section>

          <section id="ai" className="scroll-mt-6">
            <SectionHeading eyebrow="03" title="AI-помощники" icon={<Bot className="h-5 w-5" />} />
            <div className="grid gap-4 md:grid-cols-2">
              <Card className="border-primary/10">
                <CardHeader className="flex flex-row items-start gap-3 space-y-0">
                  <span className="rounded-xl bg-primary/5 p-2.5 text-primary">
                    <Bot className="h-5 w-5" />
                  </span>
                  <div>
                    <CardTitle className="text-lg">Агент-помощник юриста</CardTitle>
                    <p className="mt-1 text-sm text-muted-foreground">Для статуса «Новый»</p>
                  </div>
                </CardHeader>
                <CardContent className="text-sm leading-6 text-muted-foreground">
                  Составляет предварительный план из 3–6 этапов с датами, содержанием,
                  срочностью и планами. Проверьте результат и нажмите «Сохранить в журнал»,
                  чтобы добавить этапы в дело.
                </CardContent>
              </Card>
              <Card className="border-primary/10">
                <CardHeader className="flex flex-row items-start gap-3 space-y-0">
                  <span className="rounded-xl bg-primary/5 p-2.5 text-primary">
                    <CalendarClock className="h-5 w-5" />
                  </span>
                  <div>
                    <CardTitle className="text-lg">AI-секретарь</CardTitle>
                    <p className="mt-1 text-sm text-muted-foreground">Для статуса «В работе»</p>
                  </div>
                </CardHeader>
                <CardContent className="text-sm leading-6 text-muted-foreground">
                  Проверяет просроченные, срочные и ближайшие контрольные даты,
                  а затем показывает юристу конкретные напоминания и приоритет.
                </CardContent>
              </Card>
            </div>
            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50/70 p-4 text-sm leading-6 text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
              AI-ответ — предварительная рабочая подсказка. Проверяйте даты и содержание
              перед сохранением в журнал. Модель можно выбрать через шестерёнку в верхней панели;
              бесплатная модель может отвечать дольше обычного.
            </div>
          </section>

          <section id="deploy" className="scroll-mt-6">
            <SectionHeading eyebrow="04" title="Развёртывание и публикация" icon={<Rocket className="h-5 w-5" />} />
            <Card>
              <CardContent className="pt-6">
                <ol className="space-y-4 text-sm leading-6 text-muted-foreground">
                  <Step number="1" title="Проверьте проект" text="Запустите pnpm run typecheck и pnpm run build." />
                  <Step number="2" title="Откройте Publish" text="В Replit откройте инструмент публикации и проверьте production-настройки." />
                  <Step number="3" title="Перенесите тестовые данные при необходимости" text="Включите опцию копирования текущих данных development в production только после проверки содержимого базы." />
                  <Step number="4" title="Опубликуйте" text="Нажмите Publish и проверьте главную страницу, карточку дела и AI-кнопки." />
                </ol>
                <div className="mt-6 flex items-start gap-3 rounded-xl bg-muted/50 p-4 text-sm leading-6 text-muted-foreground">
                  <Database className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <p>
                    AI-функции требуют секрета <code className="rounded bg-background px-1.5 py-0.5 text-xs text-primary">OPENROUTER_API_KEY</code>.
                    Его значение хранится в Secrets и не должно попадать в клиентский код.
                  </p>
                </div>
              </CardContent>
            </Card>
          </section>
        </main>

        <footer className="flex flex-col gap-3 border-t border-border pt-6 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <span>CRM юриста · рабочая документация</span>
          <Link href="/" className="inline-flex items-center gap-2 font-medium text-primary hover:underline">
            <CheckCircle2 className="h-4 w-4" />
            Перейти к списку дел
          </Link>
        </footer>
      </div>
    </div>
  );
}

function SectionHeading({ eyebrow, title, icon }: { eyebrow: string; title: string; icon: React.ReactNode }) {
  return (
    <div className="mb-4 flex items-center gap-3">
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-sm font-semibold text-primary-foreground">
        {eyebrow}
      </span>
      <span className="text-primary">{icon}</span>
      <h2 className="text-2xl font-serif font-medium text-primary">{title}</h2>
    </div>
  );
}

function InfoCard({ number, title, text }: { number: string; title: string; text: string }) {
  return (
    <Card className="border-primary/10">
      <CardHeader>
        <span className="text-sm font-semibold text-muted-foreground">Шаг {number}</span>
        <CardTitle className="text-lg">{title}</CardTitle>
      </CardHeader>
      <CardContent className="pt-0 text-sm leading-6 text-muted-foreground">{text}</CardContent>
    </Card>
  );
}

function Step({ number, title, text }: { number: string; title: string; text: string }) {
  return (
    <li className="flex gap-3">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
        {number}
      </span>
      <span>
        <strong className="text-primary">{title}.</strong> {text}
      </span>
    </li>
  );
}