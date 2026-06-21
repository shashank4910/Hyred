-- Dream Company catalog Phase 2: DB catalog, exchange/unlisted seeds, user requests, manual picks

CREATE TABLE IF NOT EXISTS company_catalog (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  display_name text NOT NULL,
  region text NOT NULL,
  source text NOT NULL DEFAULT 'static',
  patterns text[] NOT NULL,
  ticker text,
  exchange text,
  is_listed boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS company_catalog_region_idx ON company_catalog (region);
CREATE INDEX IF NOT EXISTS company_catalog_display_name_idx ON company_catalog (display_name);
CREATE INDEX IF NOT EXISTS company_catalog_source_idx ON company_catalog (source);

CREATE TABLE IF NOT EXISTS company_catalog_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  requested_name text NOT NULL,
  requested_patterns text[] NOT NULL DEFAULT '{}',
  note text,
  status text NOT NULL DEFAULT 'pending',
  reviewed_at timestamptz,
  reviewer_note text,
  catalog_id uuid REFERENCES company_catalog(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT company_catalog_requests_status_check
    CHECK (status IN ('pending', 'approved', 'rejected'))
);

CREATE INDEX IF NOT EXISTS company_catalog_requests_status_idx
  ON company_catalog_requests (status, created_at DESC);

ALTER TABLE dream_companies
  ADD COLUMN IF NOT EXISTS catalog_id uuid REFERENCES company_catalog(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'catalog',
  ADD COLUMN IF NOT EXISTS custom_patterns text[];

ALTER TABLE dream_companies
  DROP CONSTRAINT IF EXISTS dream_companies_source_check;

ALTER TABLE dream_companies
  ADD CONSTRAINT dream_companies_source_check
  CHECK (source IN ('catalog', 'manual', 'approved_request'));
