-- ============================================================
-- 0004_ats_and_apply.sql
-- ATS resume storage + application profile memory store
-- Run in Supabase SQL Editor AFTER 0003_bookmarked.sql
-- ============================================================

-- ── 1. New columns on matches ────────────────────────────────
alter table matches
  add column if not exists tailored_resume_text  text,
  add column if not exists tailored_resume_url   text,
  add column if not exists auto_apply_status     text default 'pending',
  add column if not exists auto_apply_log        text,
  add column if not exists auto_apply_started_at timestamptz,
  add column if not exists auto_apply_finished_at timestamptz;

-- ── 2. Application Profile table ────────────────────────────
-- Stores the candidate's "memory" — answers to common job
-- application questions so the auto-apply agent never has
-- to ask the same question twice.
create table if not exists apply_profiles (
  id               uuid primary key default gen_random_uuid(),
  profile_id       uuid not null references profiles(id) on delete cascade,
  created_at       timestamptz default now(),
  updated_at       timestamptz default now(),

  -- Personal contact (mirrors profiles but kept separate for apply use)
  full_name        text,
  email            text,
  phone            text,
  city             text,
  state_province   text,
  country          text default 'India',
  zip_code         text,

  -- Professional links
  linkedin_url     text,
  github_url       text,
  portfolio_url    text,

  -- Experience & role
  current_title    text,
  years_experience int,
  total_ctc        text,   -- e.g. "18 LPA" or "₹18,00,000"
  expected_ctc     text,
  notice_period    text default '30 days',
  available_from   date,

  -- Work preferences
  preferred_work_type  text default 'hybrid',  -- remote/hybrid/onsite
  willing_to_relocate  boolean default false,
  relocation_cities    text,  -- comma-separated if any
  willing_to_travel    text default 'minimal', -- minimal/25%/50%/frequent

  -- Work authorization
  work_auth_country    text default 'India',
  authorized_to_work   boolean default true,
  require_sponsorship  boolean default false,

  -- Demographic (EEO — optional, many forms require it)
  gender           text,   -- Male/Female/Non-binary/Prefer not to say
  ethnicity        text,
  veteran_status   text default 'No',
  disability_status text default 'No',

  -- Standard essay answers (AI uses these as base context)
  answer_about_yourself     text,
  answer_why_leave          text,
  answer_strengths          text,
  answer_weaknesses         text,
  answer_salary_expectation text,

  -- Catch-all for custom/extra questions the agent stores over time
  -- Format: JSON array of { question: string, answer: string }
  custom_qa        jsonb default '[]'::jsonb,

  unique (profile_id)
);

create index if not exists idx_apply_profiles_profile_id
  on apply_profiles (profile_id);

-- ── 3. Supabase Storage bucket for resumes ───────────────────
-- The bucket is created via the Supabase dashboard (Storage tab).
-- Steps:
--   1. Go to Storage in Supabase dashboard
--   2. Click "New bucket"
--   3. Name: resumes
--   4. Toggle "Public bucket" OFF (private — signed URLs; see 0019)
--   5. Click Save
--
-- The SQL below creates the bucket programmatically — run it only
-- if you prefer SQL over the dashboard UI. Do NOT force public=true on
-- conflict (that would undo migration 0019).
insert into storage.buckets (id, name, public)
values ('resumes', 'resumes', false)
on conflict (id) do nothing;
