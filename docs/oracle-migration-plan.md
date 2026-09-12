# Oracle Always-Free Migration Plan — Hyred (JobRadar)

> **Why:** Supabase free-tier DB is pinned at ~95% CPU/mem ("exceeded usage" banner, Sep 2026), causing login timeouts ("upstream request timeout" / `{}`) and 6 straight failed ingest cron runs (Sep 10–12). Root cause is capacity, not app code.
> **Goal:** Move the **database + auth + storage** workload to an Oracle Cloud Always-Free ARM VM ($0 forever, 4 OCPU / 24GB RAM) while the **app stays on Vercel free** unchanged. Same self-hosted Supabase Docker stack → near-zero code changes (env vars only).

---

## Phase 0 — Preflight checks (30 min, before creating anything)

1. **Verify the current outage isn't just a quota breach.**
   - Supabase Dashboard → **Settings → Usage**: check DB size vs **500 MB** free cap; disk usage %; "exceeded usage" banner details.
   - If DB is at cap: run the **45-day stale job purge** (`cleanOldJobs` logic) and re-test login. If login recovers, migration can be deferred — but Oracle still removes the ceiling permanently.
2. **Snapshot current state** (needed for migration later, good hygiene anyway):
   - Note Supabase project ref: `jpivfymkrmwusmfciwes`.
   - Export current schema: `supabase db dump --db-url "$OLD_DB_URL" -f schema.sql` (roles + RLS included by default).
3. **Inventory what must move:** profiles + resume embeddings (pgvector), jobs, matches, ingest_runs, score ledger, storage bucket (resumes), all auth users (emails + OAuth identities), RLS policies, RPC functions.

## Phase 1 — Create the Oracle Always-Free VM (45 min, manual)

1. **Sign up:** https://www.oracle.com/cloud/free/ — needs a credit card for identity verification (not charged on Always-Free resources; set a billing alert anyway).
2. **Create VM:** Compute → Instances → Create.
   - **Shape:** `VM.Standard.A1.Flex` (Ampere ARM), **4 OCPU / 24 GB RAM** — the full Always-Free ARM allowance. ⚠️ ARM capacity in popular regions is often unavailable ("out of capacity"): pick a less-loaded home region, or retry creation at different times; some users retry daily.
   - **OS:** Ubuntu 24.04 LTS (aarch64) — matches all commands below.
   - **Boot volume:** up to 200GB total Always-Free block storage.
   - **Network:** assign a **reserved public IP**; allow inbound TCP 22 (SSH) only for now.
3. **SSH in:** `ssh -i <key> ubuntu@<PUBLIC_IP>`.

## Phase 2 — Harden + prepare the VM (1–2 h, scriptable)

Run as ubuntu user:

```bash
# Base packages (Docker official repo; ARM builds included)
sudo apt-get update && sudo apt-get -y upgrade
sudo apt-get -y install ca-certificates curl git ufw
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
echo "deb [arch=arm64 signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu noble stable" | sudo tee /etc/apt/sources.list.d/docker.list
sudo apt-get update && sudo apt-get -y install docker-ce docker-ce-cli containerd.io docker-compose-plugin
sudo usermod -aG docker ubuntu && newgrp docker

# Firewall: SSH only, everything else via Cloudflare
sudo ufw allow OpenSSH && sudo ufw --force enable

# Swap (the old free-tier killer: no swap = OOM kills under ingest load)
sudo fallocate -l 8G /swapfile && sudo chmod 600 /swapfile
sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab

# Failure recovery: auto-start containers after reboot
sudo systemctl enable --now docker
```

## Phase 3 — Self-hosted Supabase stack (1 h)

1. Get the official compose files:
   ```bash
   git clone --depth 1 https://github.com/supabase/supabase && cd supabase/docker
   cp .env.example .env
   ```
2. **Generate fresh secrets** (`POSTGRES_PASSWORD`, `JWT_SECRET`, `ANON_KEY`, `SERVICE_ROLE_KEY` via the Supabase docs' JWT generator; `DASHBOARD_USERNAME`/`PASSWORD`):
   - ⚠️ New JWT secret ⇒ **all current Supabase-issued tokens are invalidated**. This is why auth users must be migrated properly (Phase 5), not hand-copied.
   - Set `SITE_URL=https://hyred.in`, `API_EXTERNAL_URL=https://api-db.hyred.in` (or chosen host), `DISABLE_SIGNUP=false`.
3. `docker compose up -d` — brings up Postgres (with pgvector via extension install), GoTrue/auth, PostgREST, storage-api, Kong gateway, studio (bind Studio to localhost or an admin-only host).
4. **Expose via Cloudflare Tunnel** (no open ports, free, hides home/IP):
   ```bash
   cloudflared tunnel login
   cloudflared tunnel create hyred-db
   # route api-db.hyred.in (or db.hyred.in) -> http://localhost:8000 (Kong)
   cloudflared tunnel route dns hyred-db api-db.hyred.in
   cloudflared service install   # runs as systemd service
   ```
5. **Smoke test:** `curl -s https://api-db.hyred.in/auth/v1/health -H "apikey: <ANON_KEY>"` → 200.

## Phase 4 — Schema migration (1 h)

1. Apply schema to the new Postgres (direct, or through tunnel):
   ```bash
   psql "$NEW_DB_URL" -f schema.sql   # extensions, tables, RLS, functions, triggers
   ```
2. Install **pgvector** extension if not already in schema dump (`CREATE EXTENSION IF NOT EXISTS vector;`).
3. Verify counts per table match the old project (spot check: profiles, jobs, matches).

## Phase 5 — Data + auth user migration (2–4 h)

1. **Data (table-by-table, service role):** use a small Node script with `supabase-js` or `pg-copy` dumps: `profiles`, `jobs`, `matches`, `ingest_runs`, `llm_usage_log`, ledger tables, etc. 25k+ jobs with 8KB descriptions + 1536-dim embeddings will take a while — batch 500–1000 rows.
2. **Auth users — the critical part.** Self-hosted GoTrue has no user-import API; options:
   - **Option A (clean):** script INSERTs into the new `auth.users` / `auth.identities` tables preserving `id`, `email`, `encrypted_password`, `raw_user_meta_data`, `email_confirmed_at`, `created_at`; copy `auth.identities` rows for Google OAuth users and recreate the Google provider config in the new GoTrue (`GOTRUE_EXTERNAL_GOOGLE_ENABLED=true` + client id/secret).
   - **Option B (lazy):** force everyone through a password reset on first login; Google users just re-consent. Less work, some user friction.
   - Recommend **A** — the user base is small (single-digit onboarded profiles as of Sep 2026).
3. **Storage:** download resume bucket files (`supabase storage` CLI or signed URLs) → upload to self-hosted storage-api, preserving object paths; then restore `storage.buckets` + `storage.objects` metadata rows so URLs/permissions match.
4. **Extension JWTs:** users' browser extensions hold 90-day JWTs signed with the OLD secret → they will 401. Bump extension version to re-auth (or accept re-login in the extension).

## Phase 6 — App cutover (15 min, low risk)

1. Vercel project → Settings → Environment Variables:
   - `NEXT_PUBLIC_SUPABASE_URL` → `https://api-db.hyred.in`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` → new anon key (from new JWT secret)
   - `SUPABASE_SERVICE_ROLE_KEY` → new service-role key
   - GitHub Actions secrets: same three, for the ingest cron.
   - ⚠️ Grep the repo for other Supabase env usages (extension API routes use the same vars) — update everywhere.
2. Redeploy Vercel (env change requires redeploy). Cron picks up new secrets on next run.
3. **Cutover order:** freeze writes on old project (pause cron + disable dashboard mutations) → final data sync → flip env vars → redeploy → unfreeze.
4. **Smoke tests:** login (password + Google), dashboard load, job detail skill match, ingest manual run, extension autofill profile fetch, resume upload.

## Phase 7 — Ops & reliability (ongoing)

1. **Backups:** nightly `pg_dump` to the VM + weekly copy to Cloudflare R2 (free 10GB) or Backblaze B2 (free 10GB). Test a restore monthly.
2. **Monitoring:** UptimeRobot free monitor on `/auth/v1/health`; UFW + fail2ban on SSH; `docker compose logs` retention.
3. **Auto-restart after reboot:** Docker `restart: unless-stopped` on all services (compose default in official stack) + `systemctl enable docker`.
4. **Cost tripwires:** Oracle billing alert at $1; do NOT enable paid services (load balancers, extra block storage beyond 200GB, outbound data transfer beyond 10TB/mo — all far above our usage).
5. **Rollback plan:** keep the old Supabase project paused-not-deleted for 2 weeks post-cutover; env vars can be flipped back in ~5 minutes if something is broken.

## Effort / risk summary

| Phase | Time | Who | Risk |
|---|---|---|---|
| 0 Preflight | 30 m | Owner + agent | Low |
| 1 VM | 45 m | Owner (dashboard) | Low (capacity availability) |
| 2 Harden | 1–2 h | Agent scriptable | Low |
| 3 Supabase stack | 1 h | Agent scriptable | Medium (secrets/JWT regen) |
| 4 Schema | 1 h | Agent | Low |
| 5 Data + auth | 2–4 h | Agent | **Highest** — auth users + embeddings |
| 6 Cutover | 15 m | Owner + agent | Low (rollback = flip env vars) |
| 7 Ops | Ongoing | Owner + agent | Low |

**Bottom line:** ~1 focused day of work; the app itself doesn't change — only which Postgres/auth it points at. Login performance goes from "shared 95%-used free tier" to a dedicated 4-core/24GB machine for $0/month.
