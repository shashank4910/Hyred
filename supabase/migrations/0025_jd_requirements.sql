-- 0025: jd_requirements — per-JOB requirement cache for the Ready-to-Apply
-- engine (Session 46). The requirement checklist is a property of the JOB,
-- not the user: ten users applying to the same role reuse this row instead
-- of re-running the extraction LLM call ten times (same dedup lesson as the
-- job_scores ledger).
--
-- Manual run in Supabase; code degrades gracefully when missing (42P01).

create table if not exists jd_requirements (
  job_id uuid primary key references jobs(id) on delete cascade,
  requirements jsonb not null,
  created_at timestamptz not null default now()
);
