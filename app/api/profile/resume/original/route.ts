/**
 * GET /api/profile/resume/original
 * Short-lived signed URL for the user's last uploaded resume FILE
 * (exact PDF/DOCX/… — not a re-styled text PDF).
 */
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { getCurrentProfile } from '@/lib/current-user';
import { RESUME_SIGN_TTL_SEC, signResumeUrl } from '@/lib/resume-storage';

export const runtime = 'nodejs';

export async function GET() {
  const profile = await getCurrentProfile();
  if (!profile) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from('profiles')
    .select('resume_original_path, resume_original_filename, resume_original_mime')
    .eq('id', profile.id)
    .maybeSingle();

  if (error) {
    if (/resume_original_/i.test(error.message)) {
      return NextResponse.json(
        {
          error: 'no_original',
          message:
            'Original resume storage is not set up yet. Ask an admin to run migration 0020, then re-upload and Save your resume once.',
        },
        { status: 404 },
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const path = (data as { resume_original_path?: string | null } | null)
    ?.resume_original_path;
  const filename =
    (data as { resume_original_filename?: string | null } | null)
      ?.resume_original_filename || 'resume';

  if (!path) {
    return NextResponse.json(
      {
        error: 'no_original',
        message:
          'We do not have your original uploaded file yet (older uploads only kept text). Upload your resume again on My Resume and click Save — then Download will give you the exact file.',
      },
      { status: 404 },
    );
  }

  const url = await signResumeUrl(sb, path, RESUME_SIGN_TTL_SEC);
  if (!url) {
    return NextResponse.json(
      { error: 'Could not create download link. Try again.' },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    url,
    filename,
    mime:
      (data as { resume_original_mime?: string | null } | null)
        ?.resume_original_mime ?? null,
  });
}
