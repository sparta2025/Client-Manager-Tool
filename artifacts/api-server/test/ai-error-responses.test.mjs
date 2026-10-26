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
const originalFetch = globalThis.fetch;
let buildDir;
let server;
let baseUrl;

before(async () => {
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
                    select: () => ({
                      from: () => ({ where: async () => [] }),
                    }),
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
  globalThis.fetch = originalFetch;
  delete globalThis.__aiRouteTestClient;
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
