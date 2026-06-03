/** Shared Supabase select fragments for match list UIs (dashboard, API, Top MNC). */

export const MATCH_LIST_MATCH_FIELDS =
  'id, llm_score, similarity, reason, status, bookmarked, matched_skills, missing_skills, applied_at, created_at, updated_at';

export const MATCH_LIST_JOB_FIELDS =
  'id, title, company, location, remote, url, source, salary, posted_at, fetched_at';

export const MATCH_LIST_JOB_FIELDS_WITH_META = `${MATCH_LIST_JOB_FIELDS}, description, tags`;

/** Dashboard infinite scroll + API pagination */
export const MATCH_LIST_SELECT = `${MATCH_LIST_MATCH_FIELDS}, job:jobs!inner(${MATCH_LIST_JOB_FIELDS})`;

/** Server-rendered lists that may need job meta */
export const MATCH_LIST_SELECT_WITH_META = `${MATCH_LIST_MATCH_FIELDS}, job:jobs!inner(${MATCH_LIST_JOB_FIELDS_WITH_META})`;
