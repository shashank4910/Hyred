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
 * GET /api/extension/resume?match_id=<optional>
 * Returns the user's resume PDF as base64 for extension file-upload injection.
 * Uses tailored resume text when match_id is provided.
 */
export async function GET(req: NextRequest) {
  const auth = await isExtAuthed(req);
  if (!auth?.profile_id) {
    return corsResponse({ error: 'unauthorized' }, { status: 401 });
  }

  const matchId = new URL(req.url).searchParams.get('match_id');

  try {
    const sb = supabaseAdmin();
    const built = await buildExtensionResumePdf(
      sb,
      auth.profile_id,
      matchId,
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
    });
  } catch (e) {
    return corsResponse(
      { error: (e as Error).message },
      { status: 500 },
    );
  }
}
