# AGENTS.md — JobRadar (read this FIRST, then stop)

> **Universal entry point for AI coding tools** (Cursor, Claude Code, Antigravity, Kiro, Codex, Gemini CLI…).
> This file is small on purpose. It is the **router + index** for the project's knowledge base.
> **Goal: minimum tokens.** Do NOT read the big docs end-to-end. Use the Index below to open ONLY the one section you need.

---

## 30-second project summary
**Hyred** (hyred.in; repo `JobRadar`) = a **multi-user** AI job-search dashboard. Next.js 15 + React 19 + TS on Vercel, Supabase (Postgres + Auth + Storage), **Groq Llama 3.3 70B (free) primary + OpenAI gpt-4o-mini fallback** for chat, OpenAI `text-embedding-3-small` for embeddings, GitHub Actions cron for ingest, Python browser-use agent on Render for auto-apply. GitHub repo is **private**. Owner/admin: Shashank.

---

## 📖 READ PROTOCOL (this is how you save tokens)

Pick the smallest tier that fits the task. **Never read `CONTEXT.md` in full for a routine task.**

- **Tier 0 — every task (already loaded):** this file. It has the rules + the index. If the task is trivial, you're done here.
- **Tier 1 — first time in this repo, or architecture/multi-file work:** open `CONTEXT.md` → `## Key Architecture Decisions`, `## File Map`, `## Known Pitfalls` (only those three).
- **Tier 2 — a specific task:** find the matching row in the **Index** below → open ONLY that one section (grep its exact `##`/`####` heading in the target file and read from there).
- **Tier 3 — "why was this done?" / history:** open the dated session logs at the bottom of `CONTEXT.md` ONLY when investigating past decisions.

How to open one section cheaply: `grep -n "<heading text>" CONTEXT.md` to get the line, then read a bounded range — don't load the whole file.

---

## 🗂️ INDEX (topic → where → when to open)

| If you need… | Open | When |
|---|---|---|
| What the app is / stack | `CONTEXT.md` → `## Project Overview` | rarely (summary above usually enough) |
| **Coding rules / gotchas** (the must-nots) | `CONTEXT.md` → `## Known Pitfalls` | before editing AI/ingest/resume/auth code |
| How the AI pipeline works (search profile, JD fetch, 4-phase skill match, scoring) | `CONTEXT.md` → `## Key Architecture Decisions` | touching `lib/gemini.ts`, `lib/ingest.ts`, `lib/search-profile.ts` |
| Where a file/feature lives | `CONTEXT.md` → `## File Map` | locating code |
| Multi-tenant plan & phase status | `CONTEXT.md` → `## ⭐ ACTIVE INITIATIVE` → `### Progress Tracker` | planning the next phase |
| LLM provider strategy (Groq/OpenAI, why not Gemini) | `CONTEXT.md` → Phase 0 research note + the `gemini-2.0-flash` pitfall row | changing AI providers |
| Capacity limits (Groq free tier, users per key) | `CONTEXT.md` → `#### Phase 3 capacity analysis` | scaling / quota decisions |
| Cost per user / 1→1000 scaling | `CONTEXT.md` → `#### OpenAI-primary cost model` | budgeting |
| Premium pricing floor / monetization planning | `CONTEXT.md` → `#### Minimum premium pricing floor` | Stripe tiers, what to charge |
| Shared ingest / pub-sub by role topic (Phase 3) | `CONTEXT.md` → `#### Phase 3 design note — shared ingest / pub-sub by role topic` | scaling ingest before public launch |
| Multi-tenant PII in forms / resume prompts | `CONTEXT.md` → `## Known Pitfalls` (owner PII rows) | onboarding, apply-profile, `generateAtsResume` |
| Resume upload / `.doc` vs `.docx` / Vercel `fs` build | `CONTEXT.md` → `## Known Pitfalls` (resume parser + client bundle rows) + `lib/resume-upload.ts` | onboarding upload, `lib/resume.ts`, deploy failures |
| Repo visibility / deployment | `CONTEXT.md` → `## Repo & deployment notes` | go-live, collaborator access |
| **Auth / login / Supabase Auth / Google OAuth setup** | `docs/AUTH_SETUP.md` | anything auth, or go-live config |
| Multi-user identity in code (`getCurrentProfile`, per-user scoping) | `CONTEXT.md` → `### Phase 1 log` + `lib/current-user.ts` | editing pages/routes that read user data |
| Stats / ingest run UX (user-scoped metrics, stuck `running`) | `CONTEXT.md` → Known Pitfalls (Stats global pool, ingest finalize rows) + `lib/ingest-runs.ts` | Stats page, scan history, `runIngest` |
| Admin-only job sources (data lake) | `CONTEXT.md` → Known Pitfalls (source visibility row) | `MatchFilters`, Stats by-source, `MatchCard` badges |
| Delete user / re-signup data reset | `CONTEXT.md` → Known Pitfalls (0006/0008 FK rows) + migration **0008** | auth delete, orphan profiles |
| Kiro-specific steering | `.kiro/steering/jobradar-context.md` | Kiro auto-loads it |
| Past session history | `docs/context/session-log.md` (newest first) | Tier 3 only |

> Keep this Index in sync when you add/rename a `##` section in `CONTEXT.md`. It is the single source of the map.

---

## 🚦 CRITICAL RULES (always apply — do not violate)

1. **Token discipline:** follow the Read Protocol. Don't bulk-read `CONTEXT.md`.
2. **Verify before pushing:** run `npm run typecheck` (and `npm run build` for app changes). Must be clean.
3. **Git workflow:** new branch → PR → **merge when CI is green** (squash + delete branch). **Always merge** after the user approves the PR or says yes — do not leave it open waiting for a second confirmation. **Never** push follow-up commits to a merged/closed PR's branch — branch off latest `main` and open a NEW PR. After merging, verify the change is live via `https://raw.githubusercontent.com/shashank4910/JobRadar/main/<path>` (local git cache can be stale in sandboxes).
4. **Evidence-based debugging:** read actual logs/errors first; don't guess-and-check.
5. **AI providers:** Groq primary + OpenAI fallback via `LLM_PRIMARY`. **Never reintroduce `gemini-2.0-flash`** (deprecated → 429). Embeddings are OpenAI-only.
6. **Multi-user:** resolve the user with `getCurrentProfile()` (`lib/current-user.ts`); scope every user-data query by `profile_id`. Never use the old "first profile" pattern.
7. **Free infra only** beyond API keys (owner constraint). No paid services without asking.

---

## File map of the context system
- `AGENTS.md` (this) — router + index + rules. Auto-read by most 2026 tools.
- `CLAUDE.md` — pointer here (Claude Code).
- `.cursor/rules/jobradar.mdc` — pointer here (Cursor, always-apply).
- `.kiro/steering/jobradar-context.md` — Kiro steering (auto-loaded); also points here.
- `CONTEXT.md` — the full knowledge base (open by section via the Index).
- `docs/AUTH_SETUP.md` — auth/go-live runbook.
