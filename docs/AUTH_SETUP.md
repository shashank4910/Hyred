# JobRadar — Multi-User Auth Setup (Go-Live Runbook)

This is the one-time setup to make multi-user auth (Supabase Auth: email/password + Google) work on a live JobRadar deployment. The application code already supports it (Phase 1, session 7); these are the dashboard/config steps.

> **Order matters.** Do Step 1 (SQL) first, then Supabase Auth, then Google, then env vars.

---

## Overview

- **Identity:** Supabase Auth (`auth.users`) is the source of truth. Each user maps 1:1 to a `profiles` row via `profiles.user_id`.
- **The app server** resolves the user from the session cookie and filters every query by the user's `profiles.id`. RLS policies are a second layer of protection.
- **Two callback URLs** (the #1 source of confusion):
  - **Google** "Authorized redirect URI" → the **Supabase** callback: `https://<project-ref>.supabase.co/auth/v1/callback`
  - **Supabase** "Redirect URLs" → your **app**: `https://<your-app>/auth/callback`

---

## Step 1 — Run the database migration

Supabase dashboard → **SQL Editor → New query** → paste **`supabase/migrations/0005_multiuser.sql`** (in this repo) → **Run**. It is idempotent (safe to re-run).

It does three things:
1. Adds `profiles.user_id → auth.users` (+ unique index).
2. Adds `ingest_runs.profile_id` (per-user scan history).
3. Adds Row Level Security "own-rows-only" policies on `profiles`, `matches`, `apply_profiles`, `ingest_runs`.

**Verify:**
```sql
select column_name from information_schema.columns
where table_name = 'profiles' and column_name = 'user_id';        -- 1 row

select tablename, policyname from pg_policies
where policyname like 'own_%' order by tablename;                  -- the new policies
```

---

## Step 2 — Enable Supabase Auth providers

Supabase → **Authentication → Sign In / Providers**:

- **Email**: enable.
  - "Confirm email" **OFF** = instant sign-in (good for testing).
  - "Confirm email" **ON** = users must click a confirmation link (use for production).
- **Google**: enable (needs Client ID + Secret from Step 3).

While here, expand **Google** and copy the **Callback URL (for OAuth)** — you need it in Step 3:
```
https://<your-project-ref>.supabase.co/auth/v1/callback
```

---

## Step 3 — Google Cloud OAuth credentials (2026 "Google Auth Platform")

Google moved OAuth config into the **Google Auth Platform**. Old name → new name:

| Old | Now |
|---|---|
| OAuth consent screen | **Branding** + **Audience** + **Data Access** |
| Credentials → OAuth client ID | **Clients → Create client** |
| Publishing status / Test users | **Audience** |
| Scopes | **Data Access** |

1. **https://console.cloud.google.com** → pick/create a project (top-left).
2. Search **Google Auth Platform** (or open **APIs & Services** → it redirects there).
3. First time → **Get started** wizard:
   - **App Information:** App name = `JobRadar`, support email = your email.
   - **Audience:** **External**.
   - **Contact Information:** your email → agree → **Create**.
4. Left nav → **Data Access** → **Add or remove scopes** → add `.../auth/userinfo.email`, `.../auth/userinfo.profile`, `openid` → **Update** → **Save**. (Non-sensitive — no Google verification review needed.)
5. Left nav → **Audience**: while **Testing**, add your email under **Test users** (only listed users can log in). Click **Publish app** to open to everyone.
6. Left nav → **Clients** → **Create client**:
   - **Application type: Web application.**
   - Name: `JobRadar Web`.
   - **Authorized redirect URIs** → **Add URI** → paste the **Supabase** callback from Step 2:
     `https://<your-project-ref>.supabase.co/auth/v1/callback`
   - (Authorized JavaScript origins are NOT required for the Supabase server-side flow.)
   - **Create** → copy **Client ID** + **Client secret**.
7. Back in Supabase → **Authentication → Providers → Google** → paste **Client ID** + **Client secret** → **Save**.

---

## Step 4 — Supabase URL configuration

Supabase → **Authentication → URL Configuration**:
- **Site URL:** `https://<your-app>` (e.g. `https://job-radar-ten-nu.vercel.app`)
- **Redirect URLs** (add both):
  - `https://<your-app>/auth/callback`
  - `http://localhost:3000/auth/callback`

---

## Step 5 — Environment variables

**Vercel → Project → Settings → Environment Variables** (then redeploy):

| Var | Required | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | already set; now used for auth |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | already set; now used for auth (anon key, not service key) |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | server-side privileged ops |
| `OPENROUTER_API_KEY` | ✅ | the ONLY chat provider (prepaid credit) + embeddings |
| `OPENAI_API_KEY` | optional | paid LAST resort for chat |
| `ADMIN_EMAIL` | recommended | the ONE email allowed into `/admin`; blank = Admin area off |
| ~~`LLM_PRIMARY`~~ | ❌ removed | routing is fixed: OpenRouter → OpenAI (Session 49) |
| ~~`AUTH_SECRET`~~ | ❌ removed | no longer used |
| `APP_PASSWORD` | only if using the browser extension | unrelated to web sign-in now |

**GitHub Actions secrets** (cron `Daily ingest`): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `OPENROUTER_API_KEY`, `ADZUNA_*`. (`OPENAI_API_KEY` only if you want the paid last resort.) (Leave `INGEST_PROFILE_EMAIL` blank so the cron scans **all** onboarded users.)

---

## Step 6 — Verify it works

1. Open the app → you should be redirected to `/login`.
2. **Sign up** with a new email (or "Continue with Google") → land on the dashboard.
3. Go to **Resume** → upload a resume → **Run scan** → matches appear.
4. **Sign in with your own existing email** → your pre-existing profile + matches are auto-adopted (linked to your new auth account), so nothing is lost.
5. Open `/admin` as the `ADMIN_EMAIL` user → works; as anyone else → redirected away.

---

## ⚠️ Before sharing a PUBLIC link (not done yet — see CONTEXT.md)

- ✅ **`resumes` storage bucket is private** (migration **0019** + `lib/resume-storage.ts` signed URLs). **Run `0019_private_resumes_bucket.sql` in the Supabase SQL Editor** on each environment if not applied yet.
- ✅ **Original resume file download** (migration **0020**) — run `0020_profile_original_resume.sql` so My Resume can store/download the exact uploaded PDF/DOCX (not a re-styled text PDF).
- **No per-user quotas** → on a shared OpenAI key, an active stranger spends your money. Add quotas/BYOK before a public launch (Phase 3/4). See the provider cost analysis in `CONTEXT.md` Phase 3.
- **Legal:** Privacy Policy + Terms exist; add in-app "delete account" before collecting strangers' resumes (Phase 4).

For testing among a few known people, the current state is fine.

---

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `redirect_uri_mismatch` (Google) | You registered your *app* URL in Google. It must be the **Supabase** callback `https://<ref>.supabase.co/auth/v1/callback`, exact, no trailing slash. |
| "Access blocked: app not verified" / only you can log in | Audience is in **Testing** → add test users, or **Publish app** (no review needed for email/profile scopes). |
| Works locally but not in prod (or vice-versa) | Add **both** localhost and prod URLs to Supabase **Redirect URLs**. |
| Logged in but redirected to `/login` in a loop | `NEXT_PUBLIC_SUPABASE_URL` / `ANON_KEY` missing or wrong in Vercel; redeploy after setting. |
| `/admin` redirects you away | `ADMIN_EMAIL` not set (or doesn't match your login email). |
