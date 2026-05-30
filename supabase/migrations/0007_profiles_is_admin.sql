-- ============================================================
-- 0007_profiles_is_admin.sql
-- DB-driven admin flag so admin access no longer depends SOLELY on the
-- ADMIN_EMAIL env var (which broke when unset / mismatched / not synced
-- to the right Vercel environment, hiding the Admin portal).
--
-- isCurrentUserAdmin() in lib/current-user.ts returns true when EITHER:
--   • the signed-in email matches ADMIN_EMAIL (env bootstrap, unchanged), OR
--   • the user's profiles row has is_admin = true (this column).
--
-- The code reads is_admin in an error-tolerant way, so deploying the code
-- before this migration runs does NOT break the app (it simply falls back
-- to the env check until the column exists). Run in the Supabase SQL editor.
-- ============================================================

alter table public.profiles
  add column if not exists is_admin boolean not null default false;

-- Grant admin to the owner's main account. (Email is stored lowercase after
-- migration 0006; adjust the address here if your admin account differs.)
update public.profiles
set is_admin = true
where lower(email) = 'shashank.srmncr@gmail.com';
