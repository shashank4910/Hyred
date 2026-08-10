-- Always-on Telegram performance tutor learner profiles (Vercel webhook).
create table if not exists public.telegram_perf_learners (
  telegram_id bigint primary key,
  display_name text not null default '',
  profile jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.telegram_perf_learners is
  'Adaptive Performance Testing tutor state keyed by Telegram user id';

alter table public.telegram_perf_learners enable row level security;

-- Service role only (bot uses supabaseAdmin). No anon policies.
