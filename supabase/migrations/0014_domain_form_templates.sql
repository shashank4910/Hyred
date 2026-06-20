-- Shared form skeletons for custom career sites (structure only — no PII).
-- Per Claude 4.8 Tier B design: domain-level template + capture quorum.

create table if not exists domain_form_templates (
  id uuid primary key default gen_random_uuid(),
  domain text not null,
  path_pattern text not null default '/',
  structure_hash text not null,
  version int not null default 1,
  status text not null default 'draft' check (status in ('draft', 'active', 'deprecated')),
  confidence real not null default 0,
  capture_count int not null default 0,
  fields jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (domain, structure_hash)
);

create index if not exists idx_dft_domain_status on domain_form_templates (domain, status);
create index if not exists idx_dft_lookup on domain_form_templates (domain, structure_hash);

create table if not exists domain_form_captures (
  id uuid primary key default gen_random_uuid(),
  template_id uuid references domain_form_templates (id) on delete set null,
  domain text not null,
  structure_hash text not null,
  reporter_hash text not null,
  fields jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  unique (domain, structure_hash, reporter_hash)
);

create index if not exists idx_dfc_domain_hash on domain_form_captures (domain, structure_hash);
