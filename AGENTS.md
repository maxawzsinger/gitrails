# AGENTS

- Gather config variables in frontend and backend into `config.ts`.
  - `config.ts` should import env vars, verify they are not null, and export them.
  - Never set defaults in `config.ts`; throw if a required env var does not exist.
  - It can also define and export other config values.

- A function must be used more than once to justify its existence.
  - Otherwise, inline the logic and use comments to indicate what the section of code does.

- Prioritize simplicity of execution.
  - Readability is more important than stability.
  - Never silently error or follow an unhappy path.

- When editing files, do not write things that only make sense in conversation context.
  - For example, if feature A becomes feature B, do not leave comments like "no more feature A".

- Never type things as `any`.
  - If you do, call it out in chat.
