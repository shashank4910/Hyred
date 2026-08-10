import { NextRequest, NextResponse } from 'next/server';
import { getPerfTutorBot } from '@/lib/telegram-perf-tutor/bot';

export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

/**
 * Telegram webhook for the always-on Performance Testing tutor.
 * Telegram POSTs updates here; no laptop process required.
 */
export async function POST(req: NextRequest) {
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET?.trim();
  if (expected) {
    const got = req.headers.get('x-telegram-bot-api-secret-token') || '';
    if (got !== expected) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
  }

  if (!process.env.TELEGRAM_BOT_TOKEN?.trim()) {
    return NextResponse.json({ error: 'bot not configured' }, { status: 503 });
  }

  try {
    const update = await req.json();
    const bot = getPerfTutorBot();
    await bot.handleUpdate(update);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[telegram/perf-tutor]', err);
    // Still 200 so Telegram does not retry forever on app bugs.
    return NextResponse.json({ ok: false }, { status: 200 });
  }
}

export async function GET() {
  return NextResponse.json({
    service: 'telegram-perf-tutor',
    status: 'ok',
    hint: 'Telegram sends POSTs here. Run: npm run telegram:set-webhook',
  });
}
