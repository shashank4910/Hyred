-- Lease-based LLM chat semaphore (fixes slot leaks)
--
-- Problem: 0018's acquire/release pair is a bare counter. Vercel serverless
-- instances can be frozen or killed mid-request after acquiring a slot, so
-- release_llm_chat_slot never runs and active_slots ratchets up to max_slots.
-- Once pinned, every chat()/embed() waits 45s and fails with "AI is busy"
-- (observed live on prod: pinned at 25/25 for ~100 minutes).
--
-- Fix: each acquisition stamps last_acquired_at as its lease. When the pool is
-- exhausted but every lease is older than p_lease_seconds (longer than any
-- legitimate single LLM call), new acquirers reclaim the pool atomically, so
-- the semaphore self-heals instead of pinning.

ALTER TABLE llm_chat_semaphore
  ADD COLUMN IF NOT EXISTS last_acquired_at timestamptz;

CREATE OR REPLACE FUNCTION acquire_llm_chat_slot(
  p_max_slots int DEFAULT 25,
  p_lease_seconds int DEFAULT 300
)
RETURNS boolean
LANGUAGE plpgsql
AS $$
DECLARE
  granted boolean := false;
BEGIN
  UPDATE llm_chat_semaphore
  SET active_slots = CASE
        WHEN last_acquired_at IS NULL
          OR last_acquired_at < now() - make_interval(secs => GREATEST(60, p_lease_seconds))
        THEN 1  -- stale pool takeover: previous holder died; we are the sole holder
        ELSE active_slots + 1
      END,
      max_slots = GREATEST(max_slots, p_max_slots),
      last_acquired_at = now(),
      updated_at = now()
  WHERE id = 'global'
    AND (
      active_slots < GREATEST(max_slots, p_max_slots)
      OR last_acquired_at IS NULL
      OR last_acquired_at < now() - make_interval(secs => GREATEST(60, p_lease_seconds))
    )
  RETURNING true INTO granted;
  RETURN COALESCE(granted, false);
END;
$$;

-- release_llm_chat_slot from 0018 already floors at 0; unchanged here.
