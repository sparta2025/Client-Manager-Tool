---
name: Replit DB targeting
description: Avoid confusing the shell runtime label with the managed database selected for an operation.
---

Do not infer a managed database target from the shell's `REPLIT_ENVIRONMENT` value. In this workspace the shell reported `production`, while the managed Production database was unavailable; Replit documentation clarified that this value does not redirect the workspace's database URL.

**Why:** A shell environment label and the actual database target can disagree, so running a migration or seed script based on the label alone risks writing to the wrong place.

**How to apply:** Use the database tool with an explicit `environment: "development"` for Development writes and schema operations. Treat Production as read-only unless using the supported Replit Publish flow for managed schema changes. Do not run shell-based database writes until the target connection is verified.
