import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { build } from "esbuild";
import express from "express";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const apiDir = path.resolve(testDir, "..");
const originalApiKey = process.env.OPENROUTER_API_KEY;
const originalModel = process.env.OPENROUTER_MODEL;
const originalFetch = globalThis.fetch;
let buildDir;
let server;
let baseUrl;

before(async () => {
  process.env.OPENROUTER_MODEL = "openrouter/free";
  buildDir = await mkdtemp(path.join(apiDir, ".ai-test-build-"));
  await build({
    entryPoints: [path.join(apiDir, "src/routes/ai.ts")],
    outdir: buildDir,
    entryNames: "[name]",
    bundle: true,
    platform: "node",
    format: "esm",
    logLevel: "silent",
    banner: {
      js: `import { createRequire as __createRequire } from "node:module";
globalThis.require = __createRequire(import.meta.url);`,
    },
    plugins: [
      {
        name: "ai-route-test-mocks",
        setup(buildApi) {
          buildApi.onResolve({ filter: /^@workspace\/db$/ }, () => ({
            path: "db-mock",
            namespace: "ai-route-test",
          }));
          buildApi.onResolve({ filter: /^\.\.\/lib\/authorization$/ }, () => ({
            path: "authorization-mock",
            namespace: "ai-route-test",
          }));
          buildApi.onLoad(
            { filter: /^(db-mock|authorization-mock)$/, namespace: "ai-route-test" },
            ({ path: moduleName }) => ({
              contents:
                moduleName === "db-mock"
                  ? `
                  export const caseStagesTable = { clientId: {} };
                  export const db = {
                    select: () => {
                      const query = {
                        from: () => query,
                        where: async () => globalThis.__aiRouteTestStages ?? [],
                      };
                      return query;
                    },
                  };
                `
                  : `
                  export async function getAccessibleClient(_user, id) {
                    const client = globalThis.__aiRouteTestClient;
                    return client ? { ...client, id: Number(id) } : null;
                  }
                `,
              loader: "js",
            }),
          );
        },
      },
      {
        name: "drizzle-eq-test-mock",
        setup(buildApi) {
          buildApi.onResolve({ filter: /^drizzle-orm$/ }, () => ({
            path: "drizzle-mock",
            namespace: "ai-route-test",
          }));
          buildApi.onLoad({ filter: /^drizzle-mock$/, namespace: "ai-route-test" }, () => ({
            contents: "export const eq = () => ({}); export const desc = () => ({});",
            loader: "js",
          }));
        },
      },
    ],
  });

  const { default: aiRouter } = await import(pathToFileURL(path.join(buildDir, "ai.js")).href);
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.appUser = { id: 1 };
    next();
  });
  app.use(aiRouter);

  await new Promise((resolve) => {
    server = app.listen(0, "127.0.0.1", resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (server) {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
  if (buildDir) await rm(buildDir, { recursive: true, force: true });
  if (originalApiKey === undefined) delete process.env.OPENROUTER_API_KEY;
  else process.env.OPENROUTER_API_KEY = originalApiKey;
  if (originalModel === undefined) delete process.env.OPENROUTER_MODEL;
  else process.env.OPENROUTER_MODEL = originalModel;
  globalThis.fetch = originalFetch;
  delete globalThis.__aiRouteTestClient;
  delete globalThis.__aiRouteTestStages;
});

test("preliminary plan reports a safe setup hint when the AI key is missing", async () => {
  delete process.env.OPENROUTER_API_KEY;
  globalThis.__aiRouteTestClient = {
    id: 23,
    name: "Test client",
    status: "new",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
  };

  const response = await fetch(`${baseUrl}/ai/clients/23/preliminary-plan`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({}),
  });
  const payload = await response.json();

  assert.equal(response.status, 502);
  assert.equal(payload.code, "AI_NOT_CONFIGURED");
  assert.equal(payload.error, "Не удалось выполнить запрос к ИИ.");
  assert.doesNotMatch(JSON.stringify(payload), /OPENROUTER_API_KEY|test-secret/i);
});

test("deadline review distinguishes a provider rate limit without exposing its response", async () => {
  process.env.OPENROUTER_API_KEY = "test-secret-key";
  globalThis.__aiRouteTestClient = {
    id: 23,
    name: "Test client",
    status: "in_progress",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
  };
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({ error: { message: "provider returned test-secret-detail" } }),
      { status: 429, headers: { "content-type": "application/json" } },
    );

  const response = await originalFetch(`${baseUrl}/ai/clients/23/secretary-review`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({}),
  });
  const payload = await response.json();

  assert.equal(response.status, 502);
  assert.equal(payload.code, "AI_RATE_LIMITED");
  assert.equal(payload.error, "Не удалось выполнить запрос к ИИ.");
  assert.doesNotMatch(JSON.stringify(payload), /provider returned|test-secret/i);
});

test("preliminary plan retries a temporary provider failure and returns a validated plan", async () => {
  process.env.OPENROUTER_API_KEY = "test-secret-key";
  globalThis.__aiRouteTestClient = {
    id: 23,
    name: "Test client",
    status: "new",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
  };
  const generatedPlan = {
    introduction: "Собрать документы и проверить исходные обстоятельства.",
    stages: [
      {
        name: "Первичная проверка документов",
        stageDate: "2026-11-01T00:00:00.000Z",
        content: "Запросить и изучить документы по обращению.",
        result: null,
        isUrgent: false,
        controlDate: null,
        nextControlDate: null,
        nextPlans: null,
      },
    ],
  };
  let providerCalls = 0;
  globalThis.fetch = async () => {
    providerCalls += 1;
    if (providerCalls === 1) {
      return new Response("temporarily unavailable", { status: 503 });
    }
    return new Response(
      JSON.stringify({ choices: [{ message: { content: JSON.stringify(generatedPlan) } }] }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  };

  const response = await originalFetch(`${baseUrl}/ai/clients/23/preliminary-plan`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({}),
  });
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(providerCalls, 2);
  assert.equal(payload.clientId, 23);
  assert.equal(payload.model, "openrouter/free");
  assert.equal(payload.introduction, generatedPlan.introduction);
  assert.equal(payload.stages[0].name, generatedPlan.stages[0].name);
});

test("deadline review retries a temporary provider failure and keeps overdue reminder facts", async () => {
  process.env.OPENROUTER_API_KEY = "test-secret-key";
  globalThis.__aiRouteTestClient = {
    id: 23,
    name: "Test client",
    status: "in_progress",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
  };
  const overdueDate = new Date(Date.now() - 24 * 60 * 60 * 1000);
  globalThis.__aiRouteTestStages = [
    {
      id: 51,
      clientId: 23,
      name: "Срок подачи документов",
      stageDate: new Date("2026-01-01T00:00:00.000Z"),
      content: "Проверить подачу документов.",
      result: null,
      isCompleted: false,
      isUrgent: false,
      controlDate: overdueDate,
      nextControlDate: null,
      nextPlans: null,
    },
  ];
  let providerCalls = 0;
  let providerFacts;
  globalThis.fetch = async (_url, options) => {
    providerCalls += 1;
    if (providerCalls === 1) {
      return new Response("temporarily unavailable", { status: 503 });
    }
    const request = JSON.parse(options.body);
    providerFacts = JSON.parse(request.messages[1].content).facts;
    const generatedReview = {
      headline: "Проверить просроченный срок подачи документов.",
      priority: "urgent",
      items: [
        {
          stageId: 51,
          stageName: "Срок подачи документов",
          type: "overdue",
          message: "Проверить, поданы ли документы, и зафиксировать результат.",
          controlDate: overdueDate.toISOString(),
          isUrgent: false,
          isCompleted: false,
        },
      ],
    };
    return new Response(
      JSON.stringify({ choices: [{ message: { content: JSON.stringify(generatedReview) } }] }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  };

  const response = await originalFetch(`${baseUrl}/ai/clients/23/secretary-review`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({}),
  });
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(providerCalls, 2);
  assert.equal(providerFacts[0].stageId, 51);
  assert.equal(providerFacts[0].type, "overdue");
  assert.equal(payload.clientId, 23);
  assert.equal(payload.priority, "urgent");
  assert.equal(payload.items[0].type, "overdue");
  assert.equal(payload.items[0].stageName, "Срок подачи документов");
});

test("preliminary plan rejects malformed model JSON without exposing provider details", async () => {
  process.env.OPENROUTER_API_KEY = "test-secret-key";
  globalThis.__aiRouteTestClient = {
    id: 23,
    name: "Test client",
    status: "new",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
  };
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        choices: [{ message: { content: "not valid JSON: provider-private-detail" } }],
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );

  const response = await originalFetch(`${baseUrl}/ai/clients/23/preliminary-plan`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({}),
  });
  const payload = await response.json();

  assert.equal(response.status, 502);
  assert.equal(payload.code, "AI_INVALID_RESPONSE");
  assert.equal(payload.error, "Не удалось выполнить запрос к ИИ.");
  assert.doesNotMatch(JSON.stringify(payload), /provider-private-detail|test-secret/i);
});

test("deadline review rejects a model response that does not match the expected schema", async () => {
  process.env.OPENROUTER_API_KEY = "test-secret-key";
  globalThis.__aiRouteTestClient = {
    id: 23,
    name: "Test client",
    status: "in_progress",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
  };
  globalThis.__aiRouteTestStages = [];
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        choices: [{ message: { content: JSON.stringify({ headline: "No deadlines", items: "none" }) } }],
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );

  const response = await originalFetch(`${baseUrl}/ai/clients/23/secretary-review`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({}),
  });
  const payload = await response.json();

  assert.equal(response.status, 502);
  assert.equal(payload.code, "AI_INVALID_RESPONSE");
  assert.equal(payload.error, "Не удалось выполнить запрос к ИИ.");
  assert.doesNotMatch(JSON.stringify(payload), /Zod|expected|received/i);
});

test("deadline review rejects an empty model response", async () => {
  process.env.OPENROUTER_API_KEY = "test-secret-key";
  globalThis.__aiRouteTestClient = {
    id: 23,
    name: "Test client",
    status: "in_progress",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
  };
  globalThis.__aiRouteTestStages = [];
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({ choices: [{ message: { content: "" } }] }),
      { status: 200, headers: { "content-type": "application/json" } },
    );

  const response = await originalFetch(`${baseUrl}/ai/clients/23/secretary-review`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({}),
  });
  const payload = await response.json();

  assert.equal(response.status, 502);
  assert.equal(payload.code, "AI_INVALID_RESPONSE");
  assert.equal(payload.error, "Не удалось выполнить запрос к ИИ.");
});
