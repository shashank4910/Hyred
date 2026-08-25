# CLAUDE.md

## For new agents: Read `ONBOARDING.md` first — it has everything you need.

This project uses **`AGENTS.md`** as the single source of project rules + a token-saving index.

**Read `AGENTS.md` first**, then follow its Read Protocol: do NOT bulk-read `CONTEXT.md` — use the Index in `AGENTS.md` to open only the one section you need.

Critical rules (full list in `AGENTS.md`):
- Run `npm run typecheck` before pushing; new branch → PR → **always merge when CI is green** (every fix/update — do not leave PRs open); verify changes live via `raw.githubusercontent.com/.../main/<path>`.
- AI: Groq primary + OpenAI fallback (`LLM_PRIMARY`); never reintroduce `gemini-2.0-flash`.
- Multi-user: resolve users via `getCurrentProfile()`; scope every query by `profile_id`.

## Vercel Deployment Test
This is a test edit to verify Vercel deployment workflow.
