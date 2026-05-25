# JobRadar

AI-curated job matches from across the web. Pulls jobs from public APIs, scores them against your resume with Gemini, and gives you a daily shortlist plus a tailored cover letter on demand.

- **Stack**: Next.js 15 (App Router) + TypeScript + Tailwind, Supabase (Postgres), Gemini 2.0 Flash + `text-embedding-004`, GitHub Actions cron, Vercel hosting.
- **Cost target**: ₹0/month using free tiers.

## How it works

```
GitHub Actions (every 6h):
  fetch jobs (Remotive, RemoteOK, HN Who-is-hiring)
    -> upsert into Postgres (dedup by source+source_id)
    -> embed any new jobs (Gemini text-embedding-004, 768 dims)
    -> rank by cosine similarity vs your resume embedding
    -> top 25 -> Gemini 2.0 Flash scores them 0-100 with a reason
    -> persist matches with score >= min_score (default 60)

Web app (Next.js on Vercel):
  Dashboard groups matches by status (new / saved / applied / interviewing / ...).
  Click a match -> see why it scored, generate a tailored cover letter, mark applied.
```

## One-time setup

### 1. Create Supabase tables
- Go to your Supabase project -> SQL Editor.
- Open `supabase/migrations/0001_init.sql`, paste, run.

### 2. Get a Gemini API key
- https://aistudio.google.com/apikey -> Create API key. Free tier: ~1M tokens/day.

### 3. Local env
```bash
cp .env.example .env.local
# fill in NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
# SUPABASE_SERVICE_ROLE_KEY, GEMINI_API_KEY, INGEST_SECRET
```

### 4. Install + run
```bash
npm install
npm run dev
# open http://localhost:3000/onboarding -> paste your resume -> Save
# open http://localhost:3000 -> click "Run ingest now"
```

### 5. Deploy on Vercel
- Push this repo to GitHub.
- Import into Vercel.
- Add the same env vars to **Vercel -> Project -> Settings -> Environment Variables**.
- Deploy.

### 6. Schedule the cron
- Add the same env vars (plus `INGEST_PROFILE_EMAIL`) to **GitHub repo -> Settings -> Secrets and variables -> Actions**.
- The workflow `.github/workflows/ingest.yml` runs every 6 hours automatically.

## Scripts

- `npm run dev` - local dev server
- `npm run build` - production build
- `npm run ingest` - run the ingest pipeline locally (uses `.env.local`)
- `npm run typecheck` - strict TS check

## Adding a job source

Drop a new file in `lib/sources/yourSource.ts` exporting `async function fetchYourSource(): Promise<RawJob[]>`. Register it in `lib/sources/index.ts`. Done.

## Roadmap

- [ ] Resume file upload (PDF / DOCX parsing)
- [ ] More sources: Adzuna (India), Wellfound, Arbeitnow, The Muse, YC Work-at-a-Startup
- [ ] Paste-a-URL: import any LinkedIn / Naukri job by URL
- [ ] Multi-user auth (Supabase Auth)
- [ ] Email digest of top daily matches

## Security

- The Supabase service-role key is used **only server-side** (API routes + cron) and stored as a secret in GitHub Actions and Vercel.
- RLS is enabled. The `anon` key can only read from `jobs` (public data). `profiles` and `matches` are server-only.
- The `/api/ingest` endpoint is gated by `INGEST_SECRET`.
