# CRM юриста

Веб-приложение для ведения клиентских дел, журнала этапов, контрольных дат и AI-помощи юристу.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — запуск API-сервера
- `pnpm --filter @workspace/lawyer-crm run dev` — запуск веб-приложения
- `pnpm run typecheck` — полная проверка типов
- `pnpm run build` — проверка типов и production-сборка
- `pnpm --filter @workspace/api-spec run codegen` — генерация API-хуков и Zod-схем из OpenAPI
- `pnpm --filter @workspace/db run push` — применение схемы базы только в development
- Обязательные переменные: `DATABASE_URL`, `PORT`, `BASE_PATH`
- Для AI: секрет `OPENROUTER_API_KEY`

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Где находятся основные части

- `artifacts/lawyer-crm` — React + Vite интерфейс CRM
- `artifacts/api-server` — Express API
- `lib/db/src/schema` — схема PostgreSQL и Drizzle
- `lib/api-spec/openapi.yaml` — источник истины для API-контрактов
- `lib/api-client-react` — сгенерированные React-хуки API
- `lib/api-zod` — сгенерированные серверные Zod-типы
- `docs/FUNCTIONALITY.md` — пользовательские возможности
- `docs/DEPLOYMENT.md` — запуск, публикация и диагностика

## Архитектурные решения

- Клиенты и этапы хранятся в PostgreSQL; состояние не держится только в памяти браузера.
- API-контракт сначала описывается в OpenAPI, затем по нему генерируются типы и хуки.
- Закрытые дела доступны для чтения, но не получают новые AI-напоминания и изменения этапов.
- AI вызывается сервером через OpenRouter; ключ не передаётся в браузер.
- Для OpenRouter используется JSON-инструкция и серверная Zod-валидация без `response_format`.

## Продукт

- Список клиентов с фильтрацией по статусам через сводные карточки.
- Создание, редактирование, перевод в статусы `new`, `in_progress`, `closed` и удаление дел.
- Журнал этапов с содержанием, результатами, планами, срочностью и двумя контрольными датами.
- AI-агент для предварительного плана нового дела.
- AI-секретарь для просроченных, срочных и ближайших контрольных сроков.
- Встроенная страница документации по маршруту `/documentation`.

## Пользовательские предпочтения

- Интерфейс и документация — на русском языке.
- Для AI по умолчанию использовать бесплатный роутер OpenRouter `openrouter/free`; конкретную модель задавать через `OPENROUTER_MODEL`, если это необходимо.
- Не подключать встроенную Replit AI Integration повторно; использовать сохранённый `OPENROUTER_API_KEY`.

## Особенности и ограничения

- Бесплатная AI-модель может отвечать медленно; сервер выполняет один повтор для временных ошибок.
- Тестовые данные переносятся в production через Publish с включённой опцией копирования development-данных.
- После изменений OpenAPI обязательно запускайте `codegen`.
- После изменений кода перезапускайте соответствующий workflow и проверяйте логи.

## Ссылки

- [Функциональность](docs/FUNCTIONALITY.md)
- [Развёртывание](docs/DEPLOYMENT.md)
