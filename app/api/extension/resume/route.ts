import { NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { isExtAuthed } from '@/lib/extension/auth';
import { corsPreflight, corsResponse } from '@/lib/extension/cors';
import { buildExtensionResumePdf } from '@/lib/extension/resume-pdf';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function OPTIONS() {
  return corsPreflight();
}

/**
 * GET /api/extension/resume?match_id=<optional>&variant=default|tailored|auto
 * Returns the user's resume PDF as base64 for extension file-upload injection.
 * variant=tailored requires optimized text on the match; default ignores it.
 */
export async function GET(req: NextRequest) {
  const auth = await isExtAuthed(req);
  if (!auth?.profile_id) {
    return corsResponse({ error: 'unauthorized' }, { status: 401 });
  }

  const params = new URL(req.url).searchParams;
  const matchId = params.get('match_id');
  const rawVariant = params.get('variant') || 'auto';
  const variant =
    rawVariant === 'default' || rawVariant === 'tailored' || rawVariant === 'auto'
      ? rawVariant
      : 'auto';

  try {
    const sb = supabaseAdmin();
    const built = await buildExtensionResumePdf(
      sb,
      auth.profile_id,
      matchId,
      variant,
    );
    if (!built) {
      return corsResponse(
        { error: 'no resume on file — upload a resume in Hyred first' },
        { status: 404 },
      );
    }

    return corsResponse({
      ok: true,
      filename: built.filename,
      content_type: 'application/pdf',
      data_base64: built.buffer.toString('base64'),
      variant_used: built.variant_used,
    });
  } catch (e) {
    return corsResponse(
      { error: (e as Error).message },
      { status: 500 },
    );
  }
}
