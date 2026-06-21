-- Dream Company Job Alerts (Tier 2, Phase 1)
-- User picks companies from catalog; alerts fire when ingest/import creates a matching match.

CREATE TABLE IF NOT EXISTS dream_companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  company_key text NOT NULL,
  company_display_name text NOT NULL,
  notify_email boolean NOT NULL DEFAULT true,
  notify_sms boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (profile_id, company_key)
);

CREATE INDEX IF NOT EXISTS dream_companies_profile_id_idx ON dream_companies (profile_id);

CREATE TABLE IF NOT EXISTS dream_company_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  dream_company_id uuid NOT NULL REFERENCES dream_companies(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  match_id uuid REFERENCES matches(id) ON DELETE SET NULL,
  job_title text,
  company_name text,
  read_at timestamptz,
  email_sent_at timestamptz,
  sms_sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (profile_id, job_id, dream_company_id)
);

CREATE INDEX IF NOT EXISTS dream_company_alerts_profile_created_idx
  ON dream_company_alerts (profile_id, created_at DESC);

CREATE INDEX IF NOT EXISTS dream_company_alerts_unread_idx
  ON dream_company_alerts (profile_id)
  WHERE read_at IS NULL;
