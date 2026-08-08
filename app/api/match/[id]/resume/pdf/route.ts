/**
 * POST /api/match/[id]/resume/pdf
 *
 * Generates the ATS resume (if not already done), renders it to PDF,
 * uploads to the private Supabase Storage bucket "resumes", saves the
 * object path on matches.tailored_resume_url, and returns a short-lived
 * signed URL for download / apply-agent use.
 */
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { getCurrentProfile } from '@/lib/current-user';
import {
  RESUME_SIGN_TTL_SEC,
  signResumeUrl,
  uploadResumePdf,
} from '@/lib/resume-storage';

export const runtime = 'nodejs';
export const maxDuration = 120;

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const profile0 = await getCurrentProfile();
  if (!profile0) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const sb = supabaseAdmin();

  const { data: match, error } = await sb
    .from('matches')
    .select(
      `id, profile_id, tailored_resume_text,
       profile:profiles(full_name, resume_text),
       job:jobs(title, company)`,
    )
    .eq('id', id)
    .eq('profile_id', profile0.id)
    .single();

  if (error || !match) {
    return NextResponse.json({ error: error?.message ?? 'Not found' }, { status: 404 });
  }

  const profile = match.profile as unknown as {
    full_name: string | null;
    resume_text: string | null;
  };

  const resumeText =
    (match as unknown as { tailored_resume_text: string | null }).tailored_resume_text
    ?? profile.resume_text;

  if (!resumeText) {
    return NextResponse.json({ error: 'No resume text available. Generate ATS resume first.' }, { status: 400 });
  }

  const { generateBeautifulPdf } = await import('@/lib/pdf-resume');
  const pdfDoc = generateBeautifulPdf(resumeText);
  const pdfBuffer = Buffer.from(pdfDoc.output('arraybuffer'));

  const safeName = (profile.full_name ?? 'resume')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 40);

  const filename = `${match.profile_id}/${id}-${safeName}.pdf`;

  const { error: uploadErr } = await uploadResumePdf(sb, filename, pdfBuffer);
  if (uploadErr) {
    return NextResponse.json({ error: `Storage upload failed: ${uploadErr.message}` }, { status: 500 });
  }

  // Persist path (not a guessable public URL). Sign for the response.
  await sb.from('matches').update({ tailored_resume_url: filename }).eq('id', id);

  const pdfUrl = await signResumeUrl(sb, filename, RESUME_SIGN_TTL_SEC);
  if (!pdfUrl) {
    return NextResponse.json({ error: 'Failed to sign resume URL' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, url: pdfUrl, filename });
}
