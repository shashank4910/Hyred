-- Structured application profile for extension autofill (AI-extracted work + education).
alter table apply_profiles
  add column if not exists structured_work_history jsonb not null default '[]'::jsonb,
  add column if not exists structured_education jsonb not null default '[]'::jsonb,
  add column if not exists structure_extracted_at timestamptz,
  add column if not exists structure_reviewed_at timestamptz,
  add column if not exists structure_source text,
  add column if not exists structure_warnings jsonb not null default '[]'::jsonb;
