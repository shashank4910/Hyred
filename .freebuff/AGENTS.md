# Hyred (JobRadar) — Freebuff agent context

You are helping on **Hyred** (`https://www.hyred.in`), a Next.js 15 job-matching app.

## Stack
- Next.js 15 App Router, TypeScript, Tailwind (Luminous UI)
- Supabase (profiles, matches, jobs, ingest_runs)
- AI: Cerebras/Groq/OpenAI for scoring; OpenAI embeddings
- Cron ingest via GitHub Actions every 6h

## Key paths
- `lib/ingest.ts` — job scan pipeline
- `lib/gemini.ts` — scoreJob, resume insights
- `lib/experience-match.ts` — experience-level filtering
- `app/(app)/page.tsx` — dashboard
- `app/(app)/top-mnc/page.tsx` — Top MNC jobs
- `app/(app)/stats/page.tsx` — ingest run history

## Conventions
- Minimal diffs; match existing patterns
- Do not commit unless asked
- User is building a performance-engineering job search product for India/global roles
