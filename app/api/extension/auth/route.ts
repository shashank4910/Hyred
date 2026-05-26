import { NextRequest } from 'next/server';
import { comparePasswords, getAppPassword } from '@/lib/auth';
import { signExtensionToken } from '@/lib/extension/auth';
import { corsPreflight, corsResponse } from '@/lib/extension/cors';

export const runtime = 'nodejs';

export async function OPTIONS() {
  return corsPreflight();
}

/**
 * Exchange APP_PASSWORD for a long-lived (90d) extension JWT.
 * Body: { password: string }
 */
export async function POST(req: NextRequest) {
  let body: { password?: string };
  try {
    body = (await req.json()) as { password?: string };
  } catch {
    return corsResponse({ error: 'invalid body' }, { status: 400 });
  }
  const supplied = body.password ?? '';
  let expected: string;
  try {
    expected = getAppPassword();
  } catch (e) {
    return corsResponse({ error: (e as Error).message }, { status: 500 });
  }
  if (!comparePasswords(supplied, expected)) {
    return corsResponse({ error: 'wrong password' }, { status: 401 });
  }
  const token = await signExtensionToken();
  return corsResponse({ ok: true, token });
}
