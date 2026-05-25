-- JobRadar production-grade additions
-- Run this in Supabase SQL Editor AFTER 0001_init.sql

-- ============================================================
-- Add notes to matches
-- ============================================================
alter table matches add column if not exists notes text;

-- ============================================================
-- Add LLM-extracted resume insights to profiles
-- {
--   years_experience: number,
--   seniority: 'junior'|'mid'|'senior'|'staff'|'principal',
--   top_skills: string[],
--   suggested_roles: string[],
--   summary: string
-- }
-- ============================================================
alter table profiles add column if not exists insights jsonb;

-- ============================================================
-- ingest_runs: history of every ingest pipeline execution
-- ============================================================
create table if not exists ingest_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz default now(),
  finished_at timestamptz,
  duration_ms int,
  fetched int default 0,
  new_jobs int default 0,
  embedded int default 0,
  scored int default 0,
  matches_created int default 0,
  errors jsonb default '[]'::jsonb,
  triggered_by text default 'unknown',
  -- 'cron' | 'manual' | 'api'
  status text default 'running'
  -- 'running' | 'success' | 'partial' | 'failed'
);

create index if not exists idx_ingest_runs_started on ingest_runs (started_at desc);

alter table ingest_runs enable row level security;
-- ingest_runs: server only, no anon policies

-- ============================================================
-- Helpful indexes
-- ============================================================
create index if not exists idx_jobs_source on jobs (source);
create index if not exists idx_jobs_company on jobs (company);
