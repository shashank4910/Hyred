-- Work permit / authorization detail for Workday "Permit Type" textareas
alter table apply_profiles
  add column if not exists work_permit_type text;
