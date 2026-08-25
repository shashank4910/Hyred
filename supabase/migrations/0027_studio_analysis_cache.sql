-- Per-(user, job) analysis cache so the grade/verdict is computed once per (user, job)
-- and reused across visits. PK = (profile_id, job_id). TTL enforced by cron if needed.

CREATE TABLE IF NOT EXISTS studio_analysis (
  profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  analysis_json jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (profile_id, job_id)
);

-- TTL index for future cleanup (e.g., 90 days) — optional, not enabled by default
CREATE INDEX IF NOT EXISTS idx_studio_analysis_created_at ON studio_analysis(created_at);