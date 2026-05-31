-- LLM API Key Management & Token Usage Tracking
-- Run this in Supabase SQL Editor after 0008.

-- Table: llm_keys — stores LLM provider API keys with usage tracking
CREATE TABLE IF NOT EXISTS llm_keys (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  provider text NOT NULL,          -- 'cerebras', 'groq', 'openai', 'gemini', etc.
  api_key text NOT NULL,           -- the actual API key (encrypted at rest by Supabase)
  label text,                      -- human-friendly name, e.g. "Cerebras Account #2"
  model text,                      -- preferred model for this key, e.g. 'llama-3.3-70b'
  base_url text,                   -- custom base URL if different from default
  daily_token_limit int NOT NULL DEFAULT 1000000,  -- provider's daily free-tier limit
  tokens_used_today int NOT NULL DEFAULT 0,
  requests_today int NOT NULL DEFAULT 0,
  last_reset_at timestamptz NOT NULL DEFAULT now(),
  is_active boolean NOT NULL DEFAULT true,
  priority int NOT NULL DEFAULT 0, -- lower = tried first (0 = highest priority)
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_llm_keys_provider ON llm_keys(provider);
CREATE INDEX IF NOT EXISTS idx_llm_keys_active ON llm_keys(is_active);

-- Table: llm_usage_log — per-call token usage log
CREATE TABLE IF NOT EXISTS llm_usage_log (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  key_id uuid REFERENCES llm_keys(id) ON DELETE SET NULL,
  provider text NOT NULL,
  model text,
  operation text NOT NULL,         -- 'scoreJob', 'matchSkills', 'generateAtsResume', etc.
  tokens_in int NOT NULL DEFAULT 0,
  tokens_out int NOT NULL DEFAULT 0,
  tokens_total int GENERATED ALWAYS AS (tokens_in + tokens_out) STORED,
  profile_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  duration_ms int,
  status text NOT NULL DEFAULT 'success',  -- 'success', 'error', 'rate_limited'
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_llm_usage_key ON llm_usage_log(key_id);
CREATE INDEX IF NOT EXISTS idx_llm_usage_created ON llm_usage_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_llm_usage_provider ON llm_usage_log(provider);
CREATE INDEX IF NOT EXISTS idx_llm_usage_operation ON llm_usage_log(operation);

-- Function: auto-reset tokens_used_today when a new day starts (called inline, not cron)
-- The application checks last_reset_at and resets if it's a new UTC day.
-- No pg_cron needed.

-- RPC function for atomic increment of key usage counters
CREATE OR REPLACE FUNCTION increment_llm_key_usage(key_id uuid, token_count int)
RETURNS void AS $$
BEGIN
  UPDATE llm_keys
  SET tokens_used_today = tokens_used_today + token_count,
      requests_today = requests_today + 1,
      updated_at = now()
  WHERE id = key_id;
END;
$$ LANGUAGE plpgsql;

COMMENT ON TABLE llm_keys IS 'LLM provider API keys managed from the Admin Center. Keys are rotated automatically based on usage limits.';
COMMENT ON TABLE llm_usage_log IS 'Per-call token usage log for LLM operations. Used by the Admin Center dashboard.';
