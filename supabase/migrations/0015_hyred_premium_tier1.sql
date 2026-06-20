-- Premium entitlements, usage ledger, resume versions, match verdict cache, interview prep cache.

create table if not exists premium_subscriptions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  plan text not null check (plan in ('free', 'premium_monthly', 'premium_sprint')),
  status text not null default 'active' check (status in ('active', 'cancelled', 'expired')),
  cycle_start timestamptz,
  cycle_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists premium_subscriptions_profile_id_active_idx
  on premium_subscriptions (profile_id)
  where status = 'active';

create table if not exists premium_usage_events (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  feature_key text not null check (feature_key in ('interview_prep', 'match_intelligence', 'resume_studio')),
  event_key text not null,
  created_at timestamptz not null default now()
);

create unique index if not exists premium_usage_events_profile_feature_event_idx
  on premium_usage_events (profile_id, feature_key, event_key);

create table if not exists resume_versions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  match_id uuid not null references matches(id) on delete cascade,
  label text,
  resume_text text not null,
  ats_match_score smallint,
  selected_keywords text[] not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists resume_versions_profile_match_created_idx
  on resume_versions (profile_id, match_id, created_at desc);

create table if not exists match_verdicts (
  match_id uuid primary key references matches(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  verdict text not null check (verdict in ('apply', 'stretch', 'skip')),
  seniority_fit text not null check (seniority_fit in ('underqualified', 'calibrated', 'overqualified')),
  reasons jsonb not null default '[]',
  actions jsonb not null default '[]',
  generated_at timestamptz not null default now()
);

create index if not exists match_verdicts_profile_generated_idx
  on match_verdicts (profile_id, generated_at desc);

create table if not exists interview_prep_packs (
  match_id uuid primary key references matches(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  prep jsonb not null,
  generated_at timestamptz not null default now()
);

create index if not exists interview_prep_packs_profile_generated_idx
  on interview_prep_packs (profile_id, generated_at desc);
