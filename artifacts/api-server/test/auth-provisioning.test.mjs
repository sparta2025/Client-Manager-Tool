import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { build } from "esbuild";
import express from "express";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const apiDir = path.resolve(testDir, "..");
const originalDatabaseUrl = process.env.DATABASE_URL;
let buildDir;
let server;
let baseUrl;
let member;
let administrator;
let teamRouter;
let authGuards;

function selectQuery() {
  let filtered = false;
  const query = {
    where: () => {
      filtered = true;
      return query;
    },
    orderBy: async () => (filtered ? [member] : [administrator, member]),
    for: async () => [member],
  };
  return { from: () => query };
}

function makeTestDatabase() {
  return {
    select: selectQuery,
    transaction: async (operation) =>
      operation({
        execute: async () => undefined,
        select: selectQuery,
        update: () => ({
          set: (changes) => ({
            where: () => ({
              returning: async () => {
                Object.assign(member, changes, { updatedAt: new Date() });
                return [member];
              },
            }),
          }),
        }),
      }),
  };
}

before(async () => {
  process.env.DATABASE_URL ??= "postgresql://test:test@127.0.0.1:1/test";
  buildDir = await mkdtemp(path.join(apiDir, ".auth-test-build-"));
  await build({
    entryPoints: [
      path.join(apiDir, "src/routes/team.ts"),
      path.join(apiDir, "src/middlewares/auth.ts"),
    ],
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
  });

  ({ createTeamRouter: teamRouter } = await import(
    pathToFileURL(path.join(buildDir, "team.js")).href
  ));
  authGuards = await import(pathToFileURL(path.join(buildDir, "auth.js")).href);

  member = {
    id: 42,
    clerkUserId: "clerk-lawyer-pending",
    displayName: "Test Lawyer",
    email: "lawyer@example.test",
    jobTitle: null,
    phone: null,
    profileEditedAt: null,
    profileEditedBy: null,
    identityEditedAt: null,
    identityEditedBy: null,
    role: "lawyer",
    status: "pending",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  };
  administrator = {
    ...member,
    id: 1,
    clerkUserId: "clerk-admin",
    role: "admin",
    status: "active",
  };
  const router = teamRouter(makeTestDatabase());
  const app = express();
  app.use(express.json());

  app.use("/admin", (req, _res, next) => {
    req.appUser = administrator;
    next();
  }, router);

  app.use("/lawyer", (req, _res, next) => {
    req.appUser = member;
    next();
  }, authGuards.requireActiveUser);
  app.get("/lawyer/cases", (_req, res) => res.json({ access: "lawyer" }));
  app.use("/lawyer", router);

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
  if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = originalDatabaseUrl;
});

test("approval activates a lawyer without granting administrator access", async () => {
  const pendingResponse = await fetch(`${baseUrl}/lawyer/cases`);
  assert.equal(pendingResponse.status, 403);
  assert.deepEqual(await pendingResponse.json(), {
    error: "Administrator approval required",
    code: "ACCOUNT_PENDING",
  });

  const approvalResponse = await fetch(`${baseUrl}/admin/team/members/${member.id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ status: "active" }),
  });
  assert.equal(approvalResponse.status, 200);
  assert.deepEqual(
    (({ status, role }) => ({ status, role }))(await approvalResponse.json()),
    { status: "active", role: "lawyer" },
  );
  assert.equal(member.status, "active");
  assert.equal(member.role, "lawyer");

  const lawyerResponse = await fetch(`${baseUrl}/lawyer/cases`);
  assert.equal(lawyerResponse.status, 200);
  assert.deepEqual(await lawyerResponse.json(), { access: "lawyer" });

  const adminResponse = await fetch(`${baseUrl}/lawyer/team/members`);
  assert.equal(adminResponse.status, 200);
  assert.deepEqual((await adminResponse.json()).map(({ id }) => id), [member.id]);

  const forbiddenEdit = await fetch(`${baseUrl}/lawyer/team/members/1`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ phone: "000" }),
  });
  assert.equal(forbiddenEdit.status, 403);

  const roleChange = await fetch(`${baseUrl}/lawyer/team/members/${member.id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ role: "admin" }),
  });
  assert.equal(roleChange.status, 403);

  const profileEdit = await fetch(`${baseUrl}/lawyer/team/members/${member.id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jobTitle: "Юрист-консульт", phone: "+7 900 000-00-01" }),
  });
  assert.equal(profileEdit.status, 200);
  const updatedProfile = await profileEdit.json();
  assert.equal(updatedProfile.jobTitle, "Юрист-консульт");
  assert.equal(updatedProfile.profileEditedBy, "user");
});
