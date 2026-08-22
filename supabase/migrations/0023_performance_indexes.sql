-- 0023: DB performance indexes + cleanup, from the full query-pattern audit.
--
-- Hot paths covered:
--  * Ingest embed queue      → jobs(fetched_at desc) WHERE embedding IS NULL
--  * Dashboard "Newest" sort → matches(profile_id, created_at desc)  (sort uses
--                              matches.created_at, NOT posted_at — was unindexed)
--  * ilike search / city q   → pg_trgm GIN on jobs.title/company/location
--  * stale-run + stats checks→ ingest_runs(profile_id, status, started_at desc)
--  * premium quota windows   → premium_usage_events(profile_id, feature_key, created_at desc)
--  * FK cascade deletes      → job_id / match_id / profile_id support indexes
--  * llm key pool selection  → llm_keys(is_active, priority)
--
-- Also drops redundant indexes that duplicate a PK/unique leading column.

create extension if not exists pg_trgm;

-- ---------- ingest: embed queue (partial beats full fetched_at scan) ----------
create index if not exists idx_jobs_fetched_at_unembedded
  on jobs (fetched_at desc)
  where embedding is null;

-- ---------- dashboard / list sorts ----------
create index if not exists idx_matches_profile_created
  on matches (profile_id, created_at desc);

-- ---------- stats + stale ingest-run cleanup ----------
create index if not exists idx_ingest_runs_profile_status
  on ingest_runs (profile_id, status, started_at desc);

-- ---------- premium quota window checks ----------
create index if not exists idx_premium_usage_profile_feature_time
  on premium_usage_events (profile_id, feature_key, created_at desc);

-- ---------- llm key pool: active keys by priority ----------
create index if not exists idx_llm_keys_active_priority
  on llm_keys (is_active, priority);

-- ---------- FK cascade / per-FK lookups (were un-indexed → seq scans on delete) ----------
create index if not exists idx_matches_job              on matches (job_id);
create index if not exists idx_job_scores_job           on job_scores (job_id);
create index if not exists idx_resume_versions_match    on resume_versions (match_id);
create index if not exists idx_llm_usage_profile        on llm_usage_log (profile_id);
create index if not exists idx_dream_alerts_job         on dream_company_alerts (job_id);
create index if not exists idx_dream_alerts_company     on dream_company_alerts (dream_company_id);
create index if not exists idx_catalog_requests_profile on company_catalog_requests (profile_id);

-- ---------- ilike filters (dashboard q search + city filter) ----------
create index if not exists idx_jobs_title_trgm    on jobs using gin (title gin_trgm_ops);
create index if not exists idx_jobs_company_trgm  on jobs using gin (company gin_trgm_ops);
create index if not exists idx_jobs_location_trgm on jobs using gin (location gin_trgm_ops);

-- ---------- drop redundant duplicates of PK/unique leading columns ----------
drop index if exists idx_job_scores_profile;          -- = PK(profile_id, job_id) leading col
drop index if exists dream_companies_profile_id_idx;  -- = unique(profile_id, company_key) leading col
drop index if exists idx_apply_profiles_profile_id;   -- = unique(profile_id)
drop index if exists idx_dft_lookup;                  -- = unique(domain, structure_hash)
