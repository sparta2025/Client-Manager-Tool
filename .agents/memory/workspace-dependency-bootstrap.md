---
name: Workspace dependency bootstrap
description: Dependency installation order for imported pnpm monorepos in Replit.
---

After importing a pnpm workspace, complete a root `pnpm install --frozen-lockfile` before running scripts in sibling workspace packages. A filtered package operation may install one package but leave tools from other workspace packages unavailable.

**Why:** after a filtered install, the database package's `drizzle-kit` was still missing; a successful root install linked the workspace dependencies.

**How to apply:** when a fresh workspace reports missing local executables, check for a complete root install before changing package declarations.
