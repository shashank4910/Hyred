import { NextRequest } from 'next/server';
import { isExtAuthed } from '@/lib/extension/auth';
import { corsPreflight, corsResponse } from '@/lib/extension/cors';

export const runtime = 'nodejs';

export async function OPTIONS() {
  return corsPreflight();
}

/**
 * GET /api/extension/verify
 * Quick liveness + token check. Used by the extension popup to show
 * connection status without fetching profile data on every popup open.
 */
export async function GET(req: NextRequest) {
  const auth = await isExtAuthed(req);
  const isValid = auth !== null;
  return corsResponse({ ok: isValid, profile_id: auth?.profile_id ?? null }, { status: isValid ? 200 : 401 });
}
