-- 0023: DB performance indexes + cleanup, from the full query-pattern audit.
--
-- DEFENSIVE VERSION: this project applies migrations manually and selectively,
-- so some tables (e.g. company_catalog_requests / dream tables / premium
-- tables) may not exist in every environment. Each index creation checks
-- to_regclass() first and silently skips missing tables. Safe to re-run.
--
-- Hot paths covered:
--  * Ingest embed queue      → jobs(fetched_at desc) WHERE embedding IS NULL
--  * Dashboard "Newest" sort → matches(profile_id, created_at desc)
--  * ilike search / city q   → pg_trgm GIN on jobs.title/company/location
--  * stale-run + stats checks→ ingest_runs(profile_id, status, started_at desc)
--  * premium quota windows   → premium_usage_events(profile_id, feature_key, created_at desc)
--  * FK cascade deletes      → job_id / match_id / profile_id support indexes
--  * llm key pool selection  → llm_keys(is_active, priority)
--
-- Also drops redundant indexes that duplicate a PK/unique leading column.

create extension if not exists pg_trgm;

-- Helper: create an index only when its table exists.
-- Usage: select create_index_if_table_exists('idx_name', 'table', 'USING gin (col gin_trgm_ops)', 'on table ...');
create or replace function create_index_if_table_exists(index_name text, table_name text, index_def text)
returns void as $$
begin
  if to_regclass(table_name::text) is not null then
    execute format('create index if not exists %I %s', index_name, index_def);
  else
    raise notice 'skipped % (table % does not exist)', index_name, table_name;
  end if;
end;
$$ language plpgsql;

-- ---------- ingest: embed queue (partial beats full fetched_at scan) ----------
select create_index_if_table_exists(
  'idx_jobs_fetched_at_unembedded', 'jobs',
  'on jobs (fetched_at desc) where embedding is null'
);

-- ---------- dashboard / list sorts ----------
select create_index_if_table_exists(
  'idx_matches_profile_created', 'matches',
  'on matches (profile_id, created_at desc)'
);

-- ---------- stats + stale ingest-run cleanup ----------
select create_index_if_table_exists(
  'idx_ingest_runs_profile_status', 'ingest_runs',
  'on ingest_runs (profile_id, status, started_at desc)'
);

-- ---------- premium quota window checks ----------
select create_index_if_table_exists(
  'idx_premium_usage_profile_feature_time', 'premium_usage_events',
  'on premium_usage_events (profile_id, feature_key, created_at desc)'
);

-- ---------- llm key pool: active keys by priority ----------
select create_index_if_table_exists(
  'idx_llm_keys_active_priority', 'llm_keys',
  'on llm_keys (is_active, priority)'
);

-- ---------- FK cascade / per-FK lookups ----------
select create_index_if_table_exists('idx_matches_job',              'matches',                 'on matches (job_id)');
select create_index_if_table_exists('idx_job_scores_job',           'job_scores',              'on job_scores (job_id)');
select create_index_if_table_exists('idx_resume_versions_match',    'resume_versions',         'on resume_versions (match_id)');
select create_index_if_table_exists('idx_llm_usage_profile',        'llm_usage_log',           'on llm_usage_log (profile_id)');
select create_index_if_table_exists('idx_dream_alerts_job',         'dream_company_alerts',    'on dream_company_alerts (job_id)');
select create_index_if_table_exists('idx_dream_alerts_company',     'dream_company_alerts',    'on dream_company_alerts (dream_company_id)');
select create_index_if_table_exists('idx_catalog_requests_profile', 'company_catalog_requests','on company_catalog_requests (profile_id)');

-- ---------- ilike filters (dashboard q search + city filter) ----------
select create_index_if_table_exists('idx_jobs_title_trgm',    'jobs', 'on jobs using gin (title gin_trgm_ops)');
select create_index_if_table_exists('idx_jobs_company_trgm',  'jobs', 'on jobs using gin (company gin_trgm_ops)');
select create_index_if_table_exists('idx_jobs_location_trgm', 'jobs', 'on jobs using gin (location gin_trgm_ops)');

-- ---------- drop redundant duplicates of PK/unique leading columns ----------
drop index if exists idx_job_scores_profile;          -- = PK(profile_id, job_id) leading col
drop index if exists dream_companies_profile_id_idx;  -- = unique(profile_id, company_key) leading col
drop index if exists idx_apply_profiles_profile_id;   -- = unique(profile_id)
drop index if exists idx_dft_lookup;                  -- = unique(domain, structure_hash)

-- Clean up the helper function.
drop function if exists create_index_if_table_exists(text, text, text);
