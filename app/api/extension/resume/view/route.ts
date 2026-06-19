import { NextRequest, NextResponse } from 'next/server';
import { verifyResumePreviewToken } from '@/lib/extension/auth';
import { buildExtensionResumePdf } from '@/lib/extension/resume-pdf';
import { supabaseAdmin } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * GET /api/extension/resume/view?t=<short-lived-jwt>
 * Inline PDF for extension preview tabs (no Authorization header required).
 */
export async function GET(req: NextRequest) {
  const token = new URL(req.url).searchParams.get('t');
  const auth = await verifyResumePreviewToken(token);
  if (!auth?.profile_id) {
    return new NextResponse('Preview link expired or invalid.', {
      status: 401,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }

  try {
    const sb = supabaseAdmin();
    const built = await buildExtensionResumePdf(
      sb,
      auth.profile_id,
      auth.match_id ?? null,
      auth.variant ?? 'default',
    );
    if (!built) {
      return new NextResponse(
        'No resume on file — upload a resume in Hyred first.',
        { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' } },
      );
    }

    return new NextResponse(new Uint8Array(built.buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${built.filename}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (e) {
    return new NextResponse((e as Error).message, {
      status: 500,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }
}
