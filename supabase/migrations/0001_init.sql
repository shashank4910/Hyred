-- JobRadar initial schema
-- Run this in Supabase Dashboard -> SQL Editor

-- ============================================================
-- profiles: one row per user (single user MVP, but multi-ready)
-- ============================================================
create table if not exists profiles (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  full_name text,
  resume_text text,
  -- 768-d embedding stored as JSON array (Gemini text-embedding-004)
  resume_embedding jsonb,
  -- preferences JSON: { roles: string[], min_score: number, locations: string[],
  --                     remote_only: boolean, exclude_keywords: string[] }
  preferences jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ============================================================
-- jobs: deduplicated job postings from various sources
-- ============================================================
create table if not exists jobs (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  source_id text not null,
  title text not null,
  company text,
  location text,
  remote boolean default false,
  url text not null,
  description text,
  salary text,
  tags text[],
  posted_at timestamptz,
  fetched_at timestamptz default now(),
  embedding jsonb,
  unique (source, source_id)
);

create index if not exists idx_jobs_fetched_at on jobs (fetched_at desc);
create index if not exists idx_jobs_posted_at on jobs (posted_at desc);

-- ============================================================
-- matches: per-profile scored matches
-- ============================================================
create table if not exists matches (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  job_id uuid not null references jobs(id) on delete cascade,
  similarity float,
  llm_score int,
  reason text,
  status text default 'new',
  -- status in ('new','viewed','saved','applied','rejected','interviewing','offer','closed')
  cover_letter text,
  applied_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (profile_id, job_id)
);

create index if not exists idx_matches_profile_score
  on matches (profile_id, llm_score desc);
create index if not exists idx_matches_profile_status
  on matches (profile_id, status);

-- ============================================================
-- updated_at triggers
-- ============================================================
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists trg_profiles_updated on profiles;
create trigger trg_profiles_updated before update on profiles
  for each row execute function set_updated_at();

drop trigger if exists trg_matches_updated on matches;
create trigger trg_matches_updated before update on matches
  for each row execute function set_updated_at();

-- ============================================================
-- Row Level Security
-- For MVP, we use service-role from server-side only.
-- Enable RLS so anon key can't read sensitive data directly.
-- ============================================================
alter table profiles enable row level security;
alter table jobs enable row level security;
alter table matches enable row level security;

-- Allow anon to read jobs (public job board data, not sensitive)
drop policy if exists "anon_read_jobs" on jobs;
create policy "anon_read_jobs" on jobs for select using (true);

-- profiles + matches: server-side only (service role bypasses RLS)
-- No anon policies = anon cannot read these.
