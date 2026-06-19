import { NextRequest } from 'next/server';
import { isExtAuthed, signResumePreviewToken } from '@/lib/extension/auth';
import { corsPreflight, corsResponse } from '@/lib/extension/cors';

export const runtime = 'nodejs';

export async function OPTIONS() {
  return corsPreflight();
}

/**
 * POST /api/extension/resume/preview-link
 * Returns a short-lived HTTPS URL the extension can open in a new tab for inline PDF preview.
 */
export async function POST(req: NextRequest) {
  const auth = await isExtAuthed(req);
  if (!auth?.profile_id) {
    return corsResponse({ error: 'unauthorized' }, { status: 401 });
  }

  let body: { match_id?: string | null; variant?: string } = {};
  try {
    body = await req.json();
  } catch {
    /* empty body ok */
  }

  const matchId = body.match_id ?? null;
  const variant = body.variant === 'tailored' ? 'tailored' : 'default';

  const token = await signResumePreviewToken({
    profile_id: auth.profile_id,
    match_id: matchId,
    variant,
  });

  const origin = new URL(req.url).origin;
  let base = origin;
  try {
    const host = new URL(origin).hostname;
    if (host === 'hyred.in' || host === 'www.hyred.in') {
      base = 'https://www.hyred.in';
    }
  } catch {
    base = 'https://www.hyred.in';
  }

  return corsResponse({
    ok: true,
    url: `${base}/api/extension/resume/view?t=${encodeURIComponent(token)}`,
  });
}
