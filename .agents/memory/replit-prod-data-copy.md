---
name: Production data copy
description: Replit-managed production database data transfer workflow for this project.
---

Production is isolated from development. To copy the current development dataset into production, use the Publish flow and enable the option to set up the production database with current development data. The agent should not bypass this with direct production SQL writes.

**Why:** Replit exposes production database queries as read-only to the agent, and copying through Publish is the supported environment-isolation workflow.

**How to apply:** Before asking the user to publish, compare development and production data and warn that copying development data can replace or overwrite live production records.