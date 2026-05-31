import { NextRequest, NextResponse } from 'next/server';
import { isCurrentUserAdmin } from '@/lib/current-user';
import {
  getAllLlmKeys,
  addLlmKey,
  getLlmUsageSummary,
  PROVIDER_DEFAULTS,
} from '@/lib/llm-keys';

export const runtime = 'nodejs';

/**
 * GET /api/admin/llm-keys — list all LLM keys with usage stats
 */
export async function GET(req: NextRequest) {
  if (!(await isCurrentUserAdmin())) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const url = new URL(req.url);
  const days = parseInt(url.searchParams.get('days') ?? '7', 10);

  try {
    const [keys, usage] = await Promise.all([
      getAllLlmKeys(),
      getLlmUsageSummary(Math.min(days, 90)),
    ]);

    // Mask keys for response (show first 4 and last 4 chars)
    const maskedKeys = keys.map((k) => ({
      ...k,
      api_key_masked: k.api_key.length > 10
        ? `${k.api_key.slice(0, 4)}...${k.api_key.slice(-4)}`
        : '***',
      api_key: undefined, // don't send the full key in the list response
    }));

    return NextResponse.json({
      keys: maskedKeys,
      usage,
      providers: PROVIDER_DEFAULTS,
    });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message, hint: 'Run migration 0009_llm_keys.sql in the Supabase SQL editor.' },
      { status: 500 },
    );
  }
}

/**
 * POST /api/admin/llm-keys — add a new LLM key
 *
 * Body: { provider, apiKey, label?, model?, baseUrl?, dailyTokenLimit?, priority? }
 */
export async function POST(req: NextRequest) {
  if (!(await isCurrentUserAdmin())) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const body = await req.json();
  const { provider, apiKey, label, model, baseUrl, dailyTokenLimit, priority } = body as {
    provider: string;
    apiKey: string;
    label?: string;
    model?: string;
    baseUrl?: string;
    dailyTokenLimit?: number;
    priority?: number;
  };

  if (!provider || !apiKey) {
    return NextResponse.json(
      { error: 'provider and apiKey are required' },
      { status: 400 },
    );
  }

  const validProviders = Object.keys(PROVIDER_DEFAULTS);
  if (!validProviders.includes(provider)) {
    return NextResponse.json(
      { error: `Invalid provider. Must be one of: ${validProviders.join(', ')}` },
      { status: 400 },
    );
  }

  try {
    const key = await addLlmKey({
      provider,
      apiKey: apiKey.trim(),
      label,
      model,
      baseUrl,
      dailyTokenLimit,
      priority,
    });
    return NextResponse.json({ ok: true, key });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
