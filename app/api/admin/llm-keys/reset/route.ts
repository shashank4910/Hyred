import { NextRequest, NextResponse } from 'next/server';
import { isCurrentUserAdmin } from '@/lib/current-user';
import {
  forceResetProviderCounters,
  repairBluesmindsKeyBudgets,
  PROVIDER_DEFAULTS,
} from '@/lib/llm-keys';

export const runtime = 'nodejs';

/**
 * POST /api/admin/llm-keys/reset
 * Body: { provider?: string } — force-reset tokens_used_today to 0.
 * Default provider: cerebras. Omit provider to reset all keys.
 */
export async function POST(req: NextRequest) {
  if (!(await isCurrentUserAdmin())) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const provider =
    typeof body.provider === 'string' && body.provider.trim()
      ? body.provider.trim().toLowerCase()
      : 'cerebras';

  if (provider !== 'all' && !Object.keys(PROVIDER_DEFAULTS).includes(provider)) {
    return NextResponse.json(
      { error: `Invalid provider. Use "all" or one of: ${Object.keys(PROVIDER_DEFAULTS).join(', ')}` },
      { status: 400 },
    );
  }

  try {
    if (provider === 'bluesminds') {
      const result = await repairBluesmindsKeyBudgets();
      return NextResponse.json({
        ok: true,
        reset: result.reset,
        repaired: result.repaired,
        provider,
        message: `Reset ${result.reset} Bluesminds key(s); fixed ${result.repaired} misconfigured limit(s) → 300 req/day`,
      });
    }
    const count = await forceResetProviderCounters(provider === 'all' ? undefined : provider);
    return NextResponse.json({ ok: true, reset: count, provider });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
