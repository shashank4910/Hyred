-- JobRadar: add bookmarked flag to matches
-- Run this in Supabase SQL Editor AFTER 0002_production.sql

alter table matches add column if not exists bookmarked boolean not null default false;

create index if not exists idx_matches_bookmarked
  on matches (profile_id, bookmarked)
  where bookmarked = true;
