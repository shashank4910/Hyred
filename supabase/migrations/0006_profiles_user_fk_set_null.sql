-- ============================================================
-- 0006_profiles_user_fk_set_null.sql
-- Two data-safety hardening changes. Run in the Supabase SQL
-- Editor AFTER 0005.
--
-- 1. profiles.user_id FK: ON DELETE CASCADE -> ON DELETE SET NULL.
--    Deleting a Supabase Auth user now ORPHANS that user's profile
--    (keeps the resume + all matches; user_id becomes NULL) instead
--    of cascade-deleting it. The email-adoption logic in
--    lib/current-user.ts re-attaches an orphaned profile on the next
--    sign-in with the same email — so deleting/recreating an auth
--    account no longer destroys a user's data. (Cascade previously
--    wiped a profile and all its matches when its auth user was
--    deleted — exactly the footgun that lost the admin's data.)
--
-- 2. Normalize profiles.email to lowercase and keep it lowercase via
--    a BEFORE trigger. profiles_email_key is a case-SENSITIVE unique
--    index while Supabase Auth lowercases emails, so a legacy
--    mixed-case row (e.g. 'Shashank.srmncr@gmail.com') could either
--    be missed by an exact match or spawn a duplicate. Normalizing
--    on write makes the existing unique constraint effectively
--    case-insensitive without changing the conflict target used by
--    the app's upsert (onConflict: 'email').
-- ============================================================

-- ── 1. Re-point the FK: ON DELETE SET NULL ──────────────────
-- Drop whatever FK currently links profiles.user_id -> auth.users
-- (default name profiles_user_id_fkey), matched by definition so it
-- works regardless of the exact constraint name.
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
  foreign key (user_id) references auth.users(id) on delete set null;

-- ── 2. Normalize email casing ───────────────────────────────
-- Backfill existing mixed-case emails to lowercase.
-- NOTE: if this fails with a unique-violation, two rows differ only
-- by letter case — merge/resolve those first, then re-run.
update public.profiles
set email = lower(email)
where email is not null and email <> lower(email);

-- Enforce lowercase on every future insert/update. BEFORE-row
-- triggers run prior to unique-index conflict detection, so the
-- app's `upsert(..., { onConflict: 'email' })` keeps working and now
-- matches case-insensitively in practice.
create or replace function public.lowercase_profile_email()
returns trigger language plpgsql as $$
begin
  if new.email is not null then
    new.email := lower(new.email);
  end if;
  return new;
end $$;

drop trigger if exists trg_profiles_lowercase_email on public.profiles;
create trigger trg_profiles_lowercase_email
  before insert or update on public.profiles
  for each row execute function public.lowercase_profile_email();
