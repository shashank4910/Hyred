/**
 * POST /api/match/[id]/resume/pdf
 *
 * Generates the ATS resume (if not already done), renders it to PDF,
 * uploads to Supabase Storage bucket "resumes", saves the public URL
 * to matches.tailored_resume_url, and returns the URL.
 *
 * The URL can be passed directly to the Browser Use agent for file upload.
 */
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const maxDuration = 120;

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const sb = supabaseAdmin();

  // Fetch match — need tailored_resume_text (already generated) or resume_text fallback
  const { data: match, error } = await sb
    .from('matches')
    .select(
      `id, profile_id, tailored_resume_text,
       profile:profiles(full_name, resume_text),
       job:jobs(title, company)`,
    )
    .eq('id', id)
    .single();

  if (error || !match) {
    return NextResponse.json({ error: error?.message ?? 'Not found' }, { status: 404 });
  }

  const profile = match.profile as unknown as {
    full_name: string | null;
    resume_text: string | null;
  };
  const job = match.job as unknown as { title: string; company: string | null };

  const resumeText =
    (match as unknown as { tailored_resume_text: string | null }).tailored_resume_text
    ?? profile.resume_text;

  if (!resumeText) {
    return NextResponse.json({ error: 'No resume text available. Generate ATS resume first.' }, { status: 400 });
  }

  // ── Generate PDF buffer on the server using jsPDF ──────────────────────────
  // jsPDF works in Node — we generate and get the binary output as a Buffer.
  const { generateBeautifulPdf } = await import('@/lib/pdf-resume');
  const pdfDoc = generateBeautifulPdf(resumeText);
  const pdfArrayBuffer = pdfDoc.output('arraybuffer');
  const pdfBuffer = Buffer.from(pdfArrayBuffer);

  // ── Upload to Supabase Storage ─────────────────────────────────────────────
  const safeName = (profile.full_name ?? 'resume')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 40);

  const filename = `${match.profile_id}/${id}-${safeName}.pdf`;

  const { error: uploadErr } = await sb.storage
    .from('resumes')
    .upload(filename, pdfBuffer, {
      contentType: 'application/pdf',
      upsert: true,
    });

  if (uploadErr) {
    return NextResponse.json({ error: `Storage upload failed: ${uploadErr.message}` }, { status: 500 });
  }

  // ── Get public URL ─────────────────────────────────────────────────────────
  const { data: urlData } = sb.storage.from('resumes').getPublicUrl(filename);
  const pdfUrl = urlData.publicUrl;

  // ── Save URL to matches row ────────────────────────────────────────────────
  await sb.from('matches').update({ tailored_resume_url: pdfUrl }).eq('id', id);

  return NextResponse.json({ ok: true, url: pdfUrl, filename });
}
