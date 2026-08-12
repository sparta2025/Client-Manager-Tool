---
name: OpenRouter free providers
description: Compatibility constraints discovered while using a free OpenRouter model from the API server.
---

Free OpenRouter providers can reject the OpenAI-compatible `response_format` option even when normal chat completions work. They may also reject non-ASCII HTTP header values before the request leaves Node.

**Why:** The lawyer CRM's free-model calls only became reliable after removing `response_format` and keeping metadata headers ASCII-only.

**How to apply:** Prompt the model to return JSON, strip an optional fenced block, and validate the parsed object with the generated Zod response schema. Keep `X-Title` and similar header values in ASCII.