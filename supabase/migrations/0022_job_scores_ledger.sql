-- 0022: job_scores ledger — persist EVERY LLM score, not just matches.
--
-- Problem: "already scored" was derived from `matches`, but a match row is
-- only written when finalScore >= user's min score. Every job scored BELOW
-- the threshold (the majority of the funnel) left no record and was
-- re-scored on every one of the 4 daily scans, per profile — the single
-- biggest LLM cost multiplier.
--
-- This table records one row per (profile, job) regardless of outcome, so
-- re-scans skip anything already evaluated. Cleared on resume change
-- (see clearMatchesForResumeChange) so a new resume re-scores the pool.

create table if not exists job_scores (
  profile_id uuid not null references profiles(id) on delete cascade,
  job_id uuid not null references jobs(id) on delete cascade,
  score int not null,
  similarity double precision,
  scored_at timestamptz not null default now(),
  primary key (profile_id, job_id)
);

create index if not exists idx_job_scores_profile on job_scores (profile_id);

-- Backfill from existing matches so prior evaluations are honored immediately.
insert into job_scores (profile_id, job_id, score, similarity, scored_at)
select m.profile_id, m.job_id, coalesce(m.llm_score, 0), m.similarity, m.created_at
from matches m
where m.profile_id is not null and m.job_id is not null
on conflict (profile_id, job_id) do nothing;
