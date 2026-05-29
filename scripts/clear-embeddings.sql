-- Wipe stale 768-dim vectors so the next ingest re-embeds with OpenAI
-- text-embedding-3-small (1536 dims).
--
-- Background:
--   * Until May 2026 the project used Gemini text-embedding-004 (768 dims).
--   * That model was deprecated by Google on 2026-01-14 and the v1beta
--     endpoint now returns 404 for it.
--   * lib/gemini.ts embed() was switched to OpenAI text-embedding-3-small
--     (1536 dims).
--   * Cosine similarity returns 0 on length mismatch, so old 768-dim vectors
--     are silently ignored by the matcher — but they take up DB space and
--     mask the upgrade. Wipe them and let the next cron re-embed.
--
-- How to run:
--   1. Open Supabase Dashboard -> SQL Editor -> New query.
--   2. Paste this whole file. Click Run.
--   3. Re-save your profile from /onboarding so resume_embedding regenerates.
--   4. Trigger the "Daily ingest" workflow manually in GitHub Actions.
--   5. Verify ingest_runs latest row has status = 'success' and embedded > 0.
--
-- Safe to re-run; idempotent.

update jobs
set embedding = null
where embedding is not null;

update profiles
set resume_embedding = null
where resume_embedding is not null;
