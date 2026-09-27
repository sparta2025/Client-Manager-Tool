# Развёртывание и публикация

## Архитектура

Проект состоит из двух приложений:

- `artifacts/lawyer-crm` — React + Vite веб-интерфейс;
- `artifacts/api-server` — Express API-сервер.

Данные хранятся в PostgreSQL development- или production-базе в зависимости от окружения запуска.

## Требования

- Node.js 24;
- pnpm;
- PostgreSQL Replit Database;
- секрет `OPENROUTER_API_KEY` для AI-функций.

`DATABASE_URL` предоставляется подключённой базой данных. Секреты не нужно записывать в `.env`, исходный код или документацию.

## Локальный запуск

Установить зависимости:

```bash
pnpm install
```

Запустить API:

```bash
pnpm --filter @workspace/api-server run dev
```

Запустить веб-приложение во втором терминале:

```bash
pnpm --filter @workspace/lawyer-crm run dev
```

Проверить типы и production-сборку:

```bash
pnpm run typecheck
pnpm run build
```

API использует переменную `PORT`. Vite использует `PORT` и `BASE_PATH`; в Replit эти переменные задаются workflow или конфигурацией артефакта автоматически. При ручной production-сборке Vite использует безопасные значения по умолчанию: порт `5173` и базовый путь `/`.

## Workflows в Replit

Для проекта настроены:

```text
artifacts/lawyer-crm: web
pnpm --filter @workspace/lawyer-crm run dev

artifacts/api-server: API Server
pnpm --filter @workspace/api-server run dev
```

Перед публикацией убедитесь, что оба workflow запущены без ошибок.

## Публикация веб-приложения

1. Откройте инструмент **Publish** в Replit.
2. Проверьте, что публикуется артефакт `artifacts/lawyer-crm`.
3. Для первой публикации выберите подходящую видимость приложения.
4. Проверьте production-настройки API и подключённой базы.
5. Если нужно перенести текущие тестовые данные, включите опцию **«Настроить production-базу с текущими данными development»**.
6. Нажмите **Publish**.
7. После публикации откройте production URL и проверьте:
   - главную страницу;
   - создание клиента;
   - карточку клиента;
   - добавление этапа;
   - AI-кнопки при наличии `OPENROUTER_API_KEY`.

### Перенос development-данных в production

Development и production базы изолированы. Публикация с включённой опцией копирования переносит текущее содержимое development-базы в production.

Перед включением:

- проверьте, что development содержит только безопасные для продакшена данные;
- учтите, что текущие production-записи могут быть заменены или синхронизированы с development-данными;
- не переносите реальные персональные данные без необходимых оснований и защиты.

Production-базу не следует изменять прямыми SQL-командами из development-среды. Для схемы и первоначального копирования используйте Publish flow Replit.

## Секрет OpenRouter

AI-помощники требуют секрета:

```text
OPENROUTER_API_KEY
```

Добавьте его через Secrets в Replit для development и production окружения, в котором запускается API-сервер. Значение ключа не должно выводиться в логи.

Если ключ отсутствует, обычные операции CRM продолжают работать, но AI-запросы возвращают понятную ошибку.

## Обновление API-контракта

При изменении `lib/api-spec/openapi.yaml` выполните:

```bash
pnpm --filter @workspace/api-spec run codegen
pnpm run typecheck
pnpm run build
```

После изменений API или команды запуска перезапустите соответствующий workflow и проверьте его логи.

## Диагностика после публикации

### Пустая production-база

Проверьте, была ли включена опция копирования development-данных при публикации. Production-база отдельна от development-базы.

### AI не отвечает

Проверьте:

1. наличие `OPENROUTER_API_KEY` в нужном окружении;
2. доступность модели из `OPENROUTER_MODEL` или бесплатного роутера `openrouter/free`;
3. логи API-сервера;
4. что запрос выполняется для клиента с правильным статусом.

### Приложение не открывается

Проверьте production build и настройки артефакта `artifacts/lawyer-crm/.replit-artifact/artifact.toml`. Для SPA должен оставаться rewrite всех маршрутов на `/index.html`.