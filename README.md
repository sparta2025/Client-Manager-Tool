# CRM юриста

Веб-приложение для ведения клиентских дел, журнала этапов, контрольных дат и срочных задач юридической практики.

## Быстрые ссылки

- [Описание функционала](docs/FUNCTIONALITY.md)
- [Развёртывание и публикация](docs/DEPLOYMENT.md)
- [Структура проекта](replit.md)

## Быстрый запуск

```bash
pnpm install
pnpm --filter @workspace/api-server run dev
```

Во втором терминале:

```bash
pnpm --filter @workspace/lawyer-crm run dev
```

Для полной проверки:

```bash
pnpm run typecheck
pnpm run build
```

В интерфейсе приложения документация доступна по кнопке **«Документация»** на главной странице.