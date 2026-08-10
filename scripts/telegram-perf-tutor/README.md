# Telegram Performance Testing Tutor

Live AI tutor for **performance testing & engineering**.

## Always-on (laptop can be off) — recommended

The bot runs on **Hyred’s Vercel app** via a Telegram webhook. Progress is stored in **Supabase**.

### One-time setup

1. Create a bot with [@BotFather](https://t.me/BotFather) → copy token
2. Add to `.env.local` **and** Vercel project env:

```
TELEGRAM_BOT_TOKEN=123456:ABC...
TELEGRAM_WEBHOOK_SECRET=pick-a-long-random-string
GROQ_API_KEY=gsk_...   # or OPENAI_API_KEY
```

Optional (lock to your Telegram user id only):

```
TELEGRAM_ALLOWED_USER_IDS=123456789
```

3. Apply DB migration `0021_telegram_perf_learners.sql` in Supabase.
4. Deploy / merge so `/api/telegram/perf-tutor` is live.
5. Register the webhook:

```bash
npm run telegram:set-webhook
```

6. Open your bot in Telegram → `/start`

You can turn the laptop off. Telegram talks to Vercel directly.

## Local-only mode (laptop must stay on)

```bash
npm run telegram:tutor
```

This **deletes** the cloud webhook while it runs. Prefer always-on webhook for daily use.

## Commands

| Command | What it does |
|--------|----------------|
| `/start` | Start tutor + first question |
| `/next` | Next question |
| `/hint` | Hint without full answer |
| `/skip` | Skip current question |
| `/level` | Adaptive level + strengths |
| `/curriculum` | Topic map |
| `/reset` | Wipe progress |
| `/help` | Command list |
