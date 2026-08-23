# LLM Scaling Plan — 100 Users

> **Created:** Aug 19, 2026
> **Goal:** Scale Hyred from ~15 users to 100+ users with reliable AI scoring
> **Status:** ⚠️ SUPERSEDED Aug 23 (Session 49) — Cerebras/Bluesminds/Gemini/Groq all removed; the app now routes chat + embeddings to **OpenRouter only** (prepaid credit), with OpenAI gpt-4o-mini as the paid last resort. Sections below are kept for history.

---

## Current State (Aug 19, 2026)

| Provider | Keys | Status | Issue |
|---|---|---|---|
| Cerebras | 6 | 🔴 Dead | HTTP 402 — free tier quota exhausted, needs payment |
| Bluesminds | 3 (1 active) | ⚠️ Unreliable | 400 "No connected db" on heavy/parallel payloads |
| Gemini | 1 | ⚠️ Limited | 429 — free tier capped at 20 req/day |
| Groq | 1 (env key) | ✅ Works | 30 RPM, 200K TPD free. Model updated to `openai/gpt-oss-120b` |
| OpenRouter | 0 (account created) | 🟡 Pending | Needs $5 credit top-up to activate |

**Active DB keys:** 1 Groq + 1 Gemini (but Gemini is 429'd most of the day)

---

## Capacity Math (100 Users)

```
Per user per scan cycle:
  50 jobs scored × ~600 tokens = 30,000 tokens
  4 scan cycles/day = 120,000 tokens/user/day
  + ~5 chat queries × 600 tokens = 3,000 tokens
  TOTAL per user: ~123,000 tokens/day

100 users:
  Tokens/day:    12,300,000 (12.3M)
  Requests/day:  ~20,000
  RPM needed:    ~14 (spread over 6h) to ~70 (if burst)
```

---

## The Plan (3 Steps)

### Step 1: Add OpenRouter as Primary (IMMEDIATE)

**Cost:** $5 one-time credit → lasts ~4 months at 100 users

1. Sign up at openrouter.ai → add $5 credits → get API key
2. Add to `llm_keys` table:
   - provider: `openrouter`
   - label: `openrouter-primary`
   - model: `meta-llama/llama-3.1-8b-instruct`
   - base_url: `https://openrouter.ai/api/v1`
   - is_active: true
   - priority: 1
3. Set `LLM_PRIMARY=openrouter` on Vercel

**Why OpenRouter:**
- $0.05 input / $0.08 output per 1M tokens (cheapest production-quality option)
- 20 RPM, 1000 RPD after $5 credit purchase
- Automatic fallback routing across providers
- OpenAI-compatible API — drops into existing `chat()` function

### Step 2: Keep Groq as Backup (FREE)

- Already have Groq API key in env
- `openai/gpt-oss-120b` free tier: 30 RPM, 200K TPD
- Good for overflow when OpenRouter is slow or down
- No changes needed — already in the provider chain as env fallback

### Step 3: Reactivate Cerebras When Ready (OPTIONAL)

- All 6 Cerebras keys work fine, just need payment
- Add billing to one Cerebras account → all 6 keys reactivate
- Gives fast inference as another free-tier fallback
- Not required for 100 users — OpenRouter + Groq is enough

---

## Cost Projections

| Users | Tokens/day | OpenRouter Cost | Groq (if paid) |
|---|---|---|---|
| 15 (now) | ~2M | ~$0.20/day | ~$0.30/day |
| 50 | ~6M | ~$0.60/day | ~$1/day |
| 100 | ~12M | ~$1.20/day | ~$2/day |
| 500 | ~60M | ~$6/day | ~$10/day |

**$5 on OpenRouter = ~4 months of 100 users.**

---

## Provider Chain Order (after plan is executed)

```
1. OpenRouter (DB key) — primary, $0.10/1M tokens
2. Groq (DB key from env) — free backup, 200K TPD
3. Gemini (DB key) — free fallback, 20 req/day
4. Cerebras (DB keys) — free fallback, when reactivated
5. OpenAI (env key) — paid last resort
```

---

## What to Do When You Top Up OpenRouter

1. Get the API key from openrouter.ai/keys
2. Run this in the admin console or Supabase:
   ```sql
   INSERT INTO llm_keys (provider, label, api_key, model, base_url, is_active, priority, daily_token_limit)
   VALUES ('openrouter', 'openrouter-primary', '<YOUR_KEY>', 'meta-llama/llama-3.3-70b-instruct', 'https://openrouter.ai/api/v1', true, 1, 10000000);
   ```
3. Set env var on Vercel: `LLM_PRIMARY=openrouter`
4. Deploy → scan should work for all users

---

## Lessons Learned

- **Don't rely on a single free-tier provider** — they all have hidden limits (RPM, RPD, daily tokens)
- **Free tier keys die silently** — Cerebras returned 402 for days before anyone noticed
- **Bluesminds is a proxy** — breaks under heavy loads (scoring with large prompts)
- **Key rotation helps but doesn't solve** — 6 Cerebras keys all hit the same account quota
- **OpenRouter is the cheat code** — one key, pay-as-you-go, automatic provider routing
