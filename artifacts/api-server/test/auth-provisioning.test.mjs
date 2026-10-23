import assert from "node:assert/strict";
import test from "node:test";
import { createEnsureLocalUser } from "../src/lib/local-user-provisioning.ts";
import {
  requireActiveUser,
  requireAdministrator,
} from "../src/middlewares/auth-guards.ts";

function createMemoryStore() {
  const users = [];
  const notifications = [];
  let nextId = 1;
  let lockQueue = Promise.resolve();

  const store = {
    async findByClerkUserId(clerkUserId) {
      return users.find((user) => user.clerkUserId === clerkUserId);
    },
    async updateProfile(id, changes) {
      const user = users.find((entry) => entry.id === id);
      assert.ok(user, `expected user ${id} to exist`);
      Object.assign(user, changes);
      return user;
    },
    async transaction(callback) {
      let releaseLock;
      const transaction = {
        async lockInitialRegistration() {
          const previousTransaction = lockQueue;
          lockQueue = new Promise((resolve) => {
            releaseLock = resolve;
          });
          await previousTransaction;
        },
        async findByClerkUserId(clerkUserId) {
          return users.find((user) => user.clerkUserId === clerkUserId);
        },
        async countUsers() {
          return users.length;
        },
        async createUser(userData) {
          const user = {
            id: nextId++,
            ...userData,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          users.push(user);
          return user;
        },
        async createAccessRequestNotification(requesterId) {
          if (!notifications.some((notification) => notification.requesterId === requesterId)) {
            notifications.push({ requesterId });
          }
        },
      };

      try {
        return await callback(transaction);
      } finally {
        releaseLock?.();
      }
    },
  };

  return { users, notifications, ensureLocalUser: createEnsureLocalUser(store) };
}

function runMiddleware(middleware, appUser) {
  let statusCode;
  let responseBody;
  let nextCalls = 0;
  middleware(
    { appUser },
    {
      status(code) {
        statusCode = code;
        return this;
      },
      json(body) {
        responseBody = body;
        return this;
      },
    },
    () => {
      nextCalls += 1;
    },
  );
  return { statusCode, responseBody, nextCalls };
}

test("the first local account is an active administrator", async () => {
  const { ensureLocalUser } = createMemoryStore();
  const user = await ensureLocalUser("clerk-first", {
    displayName: "First User",
    email: "first@example.test",
  });

  assert.equal(user.role, "admin");
  assert.equal(user.status, "active");
  assert.equal(runMiddleware(requireActiveUser, user).nextCalls, 1);
  assert.equal(runMiddleware(requireAdministrator, user).nextCalls, 1);
});

test("later accounts are pending and cannot access active or administrator routes", async () => {
  const { ensureLocalUser, notifications } = createMemoryStore();
  await ensureLocalUser("clerk-first", { displayName: null, email: null });
  const laterUser = await ensureLocalUser("clerk-next", {
    displayName: "Later User",
    email: "later@example.test",
  });

  assert.equal(laterUser.role, "lawyer");
  assert.equal(laterUser.status, "pending");
  assert.deepEqual(notifications, [{ requesterId: laterUser.id }]);

  await ensureLocalUser("clerk-next", {
    displayName: "Later User",
    email: "later@example.test",
  });
  assert.equal(notifications.length, 1, "signing in again must not create another notification");

  const activeAccess = runMiddleware(requireActiveUser, laterUser);
  assert.equal(activeAccess.statusCode, 403);
  assert.equal(activeAccess.responseBody.code, "ACCOUNT_PENDING");
  assert.equal(activeAccess.nextCalls, 0);

  const administratorAccess = runMiddleware(requireAdministrator, laterUser);
  assert.equal(administratorAccess.statusCode, 403);
  assert.equal(administratorAccess.responseBody.error, "Administrator access required");
  assert.equal(administratorAccess.nextCalls, 0);
});

test("simultaneous first registrations grant administrator status to exactly one account", async () => {
  const { users, ensureLocalUser } = createMemoryStore();
  const registrations = await Promise.all(
    Array.from({ length: 12 }, (_, index) =>
      ensureLocalUser(`clerk-race-${index}`, {
        displayName: `User ${index}`,
        email: `user-${index}@example.test`,
      }),
    ),
  );

  const administrators = registrations.filter(
    (user) => user.role === "admin" && user.status === "active",
  );
  const pending = registrations.filter(
    (user) => user.role === "lawyer" && user.status === "pending",
  );

  assert.equal(users.length, 12);
  assert.equal(administrators.length, 1);
  assert.equal(pending.length, 11);
});

test("simultaneous requests for the same account create only one local user", async () => {
  const { users, notifications, ensureLocalUser } = createMemoryStore();
  await ensureLocalUser("clerk-first", { displayName: null, email: null });
  const registrations = await Promise.all(
    Array.from({ length: 5 }, () =>
      ensureLocalUser("clerk-same-user", { displayName: "Same User", email: null }),
    ),
  );

  assert.equal(users.length, 2);
  assert.equal(notifications.length, 1);
  assert.ok(registrations.every((user) => user.id === registrations[0].id));
});
