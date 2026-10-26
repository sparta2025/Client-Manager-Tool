---
name: API test runtime
description: Runtime constraints for automated API-server tests in the pnpm workspace.
---

Build API TypeScript modules and workspace package imports with esbuild before importing them in Node tests. Add a `createRequire` banner because bundled CommonJS dependencies can call `require` dynamically. Use an injected database test double for route behavior instead of connecting to the workspace database. If a test overrides `globalThis.fetch` to mock an external provider, use the saved original fetch for requests to the local test server.

**Why:** Node's native ESM loader does not resolve some extensionless TypeScript workspace imports, bundled CommonJS packages may require Node modules dynamically, and a global fetch override also intercepts local HTTP test requests.

**How to apply:** when adding Node-based API tests, bundle the routes and middleware they exercise, provide `globalThis.require` from `createRequire(import.meta.url)`, keep database state isolated with a test double, and call the saved original fetch for client requests while provider fetch is stubbed.
