-- 0024: Performance RPCs + pgvector column (from DB performance audit follow-ups).
--
-- 1. dashboard_status_counts()  — replaces ~10 exact COUNT queries per dashboard
--    view with ONE grouped query (status counts + inbox + bookmarked together).
-- 2. match_city_labels()        — replaces the 1000-row fetch that extracted
--    cities client-side; city extraction now happens in the database.
-- 3. candidate_jobs()           — ingest candidate pool: DB computes cosine
--    similarity against the pgvector column so ~800×1536 floats (~6 MB of
--    JSONB) no longer ship to the app per scan.
--
-- pgvector: jobs.embedding_vec vector(1536) backfilled from the existing jsonb
-- embedding where the array length is 1536 (OpenAI text-embedding-3-small).
-- Legacy 768-dim rows are left NULL — they already score 0 in the JS cosine
-- path and the app keeps a fallback for them.
--
-- All functions are STABLE, SECURITY INVOKER (called with the service-role
-- client which bypasses RLS; jobs is public-read anyway).

create extension if not exists vector;

alter table jobs add column if not exists embedding_vec vector(1536);

-- One-shot backfill from jsonb (jsonb::text is "[0.1,0.2,...]" which casts
-- directly to vector). Idempotent.
--
-- ⚠️ BATCHED ON PURPOSE: a single UPDATE over the whole jobs table exceeds
-- the Supabase SQL editor's upstream timeout on large tables. Run the
-- statement below REPEATEDLY (it processes 1,000 rows per run) until it
-- reports "Update rows 0", then the backfill is complete.
update jobs
set embedding_vec = (embedding::text)::vector
where id in (
  select id
  from jobs
  where embedding is not null
    and embedding_vec is null
    and jsonb_array_length(embedding) = 1536
  limit 1000
);

-- ---------- 1. Dashboard status counts (single grouped query) ----------
-- Mirrors getDashboardCounts() in lib/match-stats.ts:
--   p_stale_cutoff NULL  = include-older-jobs mode (expired=1), no freshness filter
--   p_min_score 0        = no score floor (NULL llm_score rows included)
create or replace function dashboard_status_counts(
  p_profile_id uuid,
  p_min_score int default 50,
  p_stale_cutoff timestamptz default null,
  p_source text default null,
  p_remote boolean default null,
  p_city text default null,
  p_q text default null
)
returns jsonb
language sql stable as $$
  with base as (
    select m.status, m.bookmarked
    from matches m
    join jobs j on j.id = m.job_id
    where m.profile_id = p_profile_id
      and (p_min_score <= 0 or m.llm_score >= p_min_score)
      and (
        p_stale_cutoff is null
        or j.posted_at is null
        or j.posted_at >= p_stale_cutoff
        or j.fetched_at >= p_stale_cutoff
      )
      and (p_source is null or j.source = p_source)
      and (p_remote is null or j.remote = true)
      and (p_city is null or j.location ilike '%' || p_city || '%')
      and (p_q is null or j.title ilike '%' || p_q || '%' or j.company ilike '%' || p_q || '%')
  ),
  agg as (
    select status, count(*) as n from base group by status
  )
  select jsonb_build_object(
    'counts', (select coalesce(jsonb_object_agg(status, n), '{}'::jsonb) from agg),
    'inbox', (select coalesce(sum(n), 0) from agg where status in ('new', 'viewed')),
    'bookmarked', (select count(*) from base where bookmarked = true)
  );
$$;

-- ---------- 2. City labels for the location dropdown ----------
-- Mirrors listMatchCities() + extractCityLabel(): first segment of location
-- split on , · | ; /, remote-ish labels dropped, min length 2,
-- case-insensitive dedupe, alphabetical.
create or replace function match_city_labels(
  p_profile_id uuid,
  p_min_score int default 50,
  p_stale_cutoff timestamptz default null,
  p_status text default 'inbox',
  p_bookmarked boolean default false,
  p_source text default null,
  p_q text default null
)
returns text[]
language sql stable as $$
  select coalesce(
    array_agg(city order by city),
    '{}'::text[]
  )
  from (
    select distinct on (lower(t.city)) t.city as city
    from (
      select trim((regexp_split_to_array(j.location, '[,·|;/]'))[1]) as city
      from matches m
      join jobs j on j.id = m.job_id
      where m.profile_id = p_profile_id
        and (p_min_score <= 0 or m.llm_score >= p_min_score)
        and (
          p_stale_cutoff is null
          or j.posted_at is null
          or j.posted_at >= p_stale_cutoff
          or j.fetched_at >= p_stale_cutoff
        )
        and (
          case
            when p_bookmarked then m.bookmarked = true
            when p_status = 'inbox' then m.status in ('new', 'viewed')
            else m.status = p_status
          end
        )
        and (p_source is null or j.source = p_source)
        and (p_q is null or j.title ilike '%' || p_q || '%' or j.company ilike '%' || p_q || '%')
        and j.location is not null
    ) t
    where length(t.city) >= 2
      and t.city !~* '^(remote|anywhere|work from home|wfh|global|worldwide|hybrid)$'
    order by lower(t.city)
  ) d;
$$;

-- ---------- 3. Ingest candidate pool with DB-side similarity ----------
-- Same semantics as the old query (newest-first, limit 800, embedded jobs
-- only) but similarity is computed in SQL against the vector column instead
-- of shipping every embedding to the app.
create or replace function candidate_jobs(
  p_resume vector(1536),
  p_limit int default 800
)
returns table (
  id uuid,
  title text,
  company text,
  location text,
  description text,
  url text,
  similarity real
)
language sql stable as $$
  select j.id, j.title, j.company, j.location, j.description, j.url,
         (1 - (j.embedding_vec <=> p_resume))::real as similarity
  from jobs j
  where j.embedding_vec is not null
  order by j.fetched_at desc
  limit p_limit;
$$;
