---
name: API test runtime
description: Runtime constraints for automated API-server tests in the pnpm workspace.
---

Build API TypeScript modules and workspace package imports with esbuild before importing them in Node tests. Add a `createRequire` banner because bundled CommonJS dependencies can call `require` dynamically. Use an injected database test double for route behavior instead of connecting to the workspace database.

**Why:** Node's native ESM loader does not resolve some extensionless TypeScript workspace imports, and bundled CommonJS packages may require Node modules dynamically.

**How to apply:** when adding Node-based API tests, bundle the routes and middleware they exercise, provide `globalThis.require` from `createRequire(import.meta.url)`, and keep database state isolated with a test double.
