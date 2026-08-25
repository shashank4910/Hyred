# REMINDER — 16 Aug 2026: switch Groq model

**Do this today.** Groq turns off `llama-3.3-70b-versatile` on **16 Aug 2026**. After that, Hyred chat on Groq will fail.

## Switch to (Groq’s recommended replacement)

Prefer: `openai/gpt-oss-120b`  
Backup: `qwen/qwen3.6-27b`

Docs: https://console.groq.com/docs/deprecations

## Files to change

- `lib/gemini.ts` — `GROQ_CHAT_MODEL` default
- `lib/llm-keys.ts` — Groq default model
- `browser_agent/main.py` — `GROQ_MODEL` default
- Any Groq rows in `llm_keys` (Admin keys) + env `GROQ_MODEL` if set on Vercel

Then: typecheck → PR → merge (chat/API change).

After it is live, delete this note and `.cursor/rules/groq-llama-cutover.mdc`.
