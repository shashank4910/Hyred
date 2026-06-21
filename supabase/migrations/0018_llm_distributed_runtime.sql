-- Distributed LLM runtime state (multi-instance / Vercel-safe)
-- Run after 0009_llm_keys.sql

CREATE TABLE IF NOT EXISTS llm_key_runtime (
  key_id text PRIMARY KEY,
  cooldown_until timestamptz,
  consecutive_failures int NOT NULL DEFAULT 0,
  last_failure_at timestamptz,
  last_success_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_llm_key_runtime_cooldown ON llm_key_runtime(cooldown_until);

CREATE TABLE IF NOT EXISTS llm_chat_semaphore (
  id text PRIMARY KEY DEFAULT 'global',
  active_slots int NOT NULL DEFAULT 0,
  max_slots int NOT NULL DEFAULT 25,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO llm_chat_semaphore (id, active_slots, max_slots)
VALUES ('global', 0, 25)
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION acquire_llm_chat_slot(p_max_slots int DEFAULT 25)
RETURNS boolean
LANGUAGE plpgsql
AS $$
DECLARE
  acquired boolean := false;
BEGIN
  UPDATE llm_chat_semaphore
  SET active_slots = active_slots + 1,
      max_slots = GREATEST(max_slots, p_max_slots),
      updated_at = now()
  WHERE id = 'global' AND active_slots < max_slots
  RETURNING true INTO acquired;
  RETURN COALESCE(acquired, false);
END;
$$;

CREATE OR REPLACE FUNCTION release_llm_chat_slot()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE llm_chat_semaphore
  SET active_slots = GREATEST(0, active_slots - 1),
      updated_at = now()
  WHERE id = 'global';
END;
$$;

CREATE OR REPLACE FUNCTION set_llm_key_cooldown(
  p_key_id text,
  p_cooldown_seconds int,
  p_failures int
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO llm_key_runtime (key_id, cooldown_until, consecutive_failures, last_failure_at, updated_at)
  VALUES (
    p_key_id,
    now() + make_interval(secs => GREATEST(1, p_cooldown_seconds)),
    GREATEST(1, p_failures),
    now(),
    now()
  )
  ON CONFLICT (key_id) DO UPDATE SET
    cooldown_until = EXCLUDED.cooldown_until,
    consecutive_failures = EXCLUDED.consecutive_failures,
    last_failure_at = EXCLUDED.last_failure_at,
    updated_at = now();
END;
$$;

CREATE OR REPLACE FUNCTION clear_llm_key_cooldown(p_key_id text)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO llm_key_runtime (key_id, cooldown_until, consecutive_failures, last_success_at, updated_at)
  VALUES (p_key_id, NULL, 0, now(), now())
  ON CONFLICT (key_id) DO UPDATE SET
    cooldown_until = NULL,
    consecutive_failures = GREATEST(0, llm_key_runtime.consecutive_failures - 1),
    last_success_at = now(),
    updated_at = now();
END;
$$;

COMMENT ON TABLE llm_key_runtime IS 'Cross-instance RPM cooldowns for LLM keys (uuid or env:provider ids).';
COMMENT ON TABLE llm_chat_semaphore IS 'Global in-flight LLM call cap across Vercel instances.';
