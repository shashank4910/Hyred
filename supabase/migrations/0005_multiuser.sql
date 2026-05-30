-- ============================================================
-- 0005_multiuser.sql
-- Multi-tenant identity: link profiles to Supabase Auth users,
-- add per-user ingest_runs, and RLS policies keyed to auth.uid()
-- as defense-in-depth. Run in Supabase SQL Editor AFTER 0004.
--
-- NOTE on isolation model (Phase 1):
--   The Next.js server resolves the current user via Supabase Auth and
--   filters every query by profiles.id (service-role client). The RLS
--   policies below are a SECOND layer of protection so that even a leaked
--   anon key cannot read another user's profile/matches. Server code uses
--   the service-role key, which bypasses RLS, so these policies do not
--   affect existing server reads.
-- ============================================================

-- ── 1. Link profiles to auth.users ──────────────────────────
alter table profiles
  add column if not exists user_id uuid references auth.users(id) on delete cascade;

-- One profile per auth user. Unique index allows multiple NULLs, so legacy
-- (pre-multiuser) rows without a user_id continue to coexist until adopted.
create unique index if not exists idx_profiles_user_id on profiles (user_id);

-- ── 2. Per-user ingest runs ─────────────────────────────────
alter table ingest_runs
  add column if not exists profile_id uuid references profiles(id) on delete cascade;

create index if not exists idx_ingest_runs_profile
  on ingest_runs (profile_id, started_at desc);

-- ============================================================
-- 3. Row Level Security — own-rows-only for authenticated users
-- ============================================================

-- profiles: a user may read/insert/update ONLY their own row.
drop policy if exists "own_profile_select" on profiles;
create policy "own_profile_select" on profiles
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "own_profile_insert" on profiles;
create policy "own_profile_insert" on profiles
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists "own_profile_update" on profiles;
create policy "own_profile_update" on profiles
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- matches: scoped through the owning profile.
drop policy if exists "own_matches_all" on matches;
create policy "own_matches_all" on matches
  for all to authenticated
  using (
    exists (
      select 1 from profiles p
      where p.id = matches.profile_id and p.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from profiles p
      where p.id = matches.profile_id and p.user_id = auth.uid()
    )
  );

-- apply_profiles: scoped through the owning profile.
alter table apply_profiles enable row level security;

drop policy if exists "own_apply_profile_all" on apply_profiles;
create policy "own_apply_profile_all" on apply_profiles
  for all to authenticated
  using (
    exists (
      select 1 from profiles p
      where p.id = apply_profiles.profile_id and p.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from profiles p
      where p.id = apply_profiles.profile_id and p.user_id = auth.uid()
    )
  );

-- ingest_runs: a user may read only their own runs.
drop policy if exists "own_ingest_runs_select" on ingest_runs;
create policy "own_ingest_runs_select" on ingest_runs
  for select to authenticated
  using (
    profile_id is not null and exists (
      select 1 from profiles p
      where p.id = ingest_runs.profile_id and p.user_id = auth.uid()
    )
  );

-- jobs remain a shared, globally-readable pool (anon_read_jobs policy from
-- 0001 still applies) — embed once, match for everyone.
