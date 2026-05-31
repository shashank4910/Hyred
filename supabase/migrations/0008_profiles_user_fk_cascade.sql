-- ============================================================
-- 0008_profiles_user_fk_cascade.sql
-- Revert 0006's ON DELETE SET NULL → ON DELETE CASCADE.
--
-- Evidence: deleting a user in Supabase Auth (0006) only NULLs
-- profiles.user_id; the profile + all matches remain. On the next
-- sign-in with the same email, lib/current-user.ts adoptProfileByEmail()
-- re-attaches that row — so "deleted" users see their old data again.
--
-- Expected behavior when an auth user is deleted: profile row and
-- all dependent rows (matches, apply_profiles, ingest_runs via FK)
-- are removed. Re-signup with the same email starts fresh.
-- ============================================================

do $$
declare
  fk_name text;
begin
  for fk_name in
    select conname
    from pg_constraint
    where conrelid = 'public.profiles'::regclass
      and contype = 'f'
      and pg_get_constraintdef(oid) ilike '%auth.users%'
      and pg_get_constraintdef(oid) ilike '%user_id%'
  loop
    execute format('alter table public.profiles drop constraint %I', fk_name);
  end loop;
end $$;

alter table public.profiles
  add constraint profiles_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete cascade;
