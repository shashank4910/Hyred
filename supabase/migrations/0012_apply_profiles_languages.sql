-- Spoken languages for ATS autofill (Workday multiselect, etc.)
alter table apply_profiles
  add column if not exists languages jsonb not null default '["English","Hindi"]'::jsonb;
