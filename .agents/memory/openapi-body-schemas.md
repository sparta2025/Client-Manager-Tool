---
name: OpenAPI body schemas
description: Поведение Orval при генерации Zod для общих OpenAPI-схем request body.
---

Orval может экспортировать общую OpenAPI-схему тела как TypeScript-тип, а runtime-Zod-схему — под именем конкретной операции, например `Create...Body`.

**Why:** попытка вызвать `.safeParse` у общего имени схемы приводит к ошибке TypeScript после codegen.

**How to apply:** после изменения OpenAPI сначала запускайте codegen и смотрите `lib/api-zod/src/generated/api.ts`; серверную runtime-валидацию привязывайте к сгенерированной operation-specific Body-схеме.