import type { SupabaseClient } from '@supabase/supabase-js';
import { generateBeautifulPdf } from '@/lib/pdf-resume';

function safeFilename(name: string | null | undefined, suffix = 'resume') {
  const base = (name || suffix)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
  return `${base || suffix}.pdf`;
}

/**
 * Build a PDF resume buffer for the extension upload flow.
 * Prefers tailored resume text for a match when matchId is provided.
 */
export async function buildExtensionResumePdf(
  sb: SupabaseClient,
  profileId: string,
  matchId?: string | null,
): Promise<{ buffer: Buffer; filename: string } | null> {
  const { data: profile } = await sb
    .from('profiles')
    .select('full_name, resume_text')
    .eq('id', profileId)
    .maybeSingle();

  if (!profile?.resume_text) return null;

  let resumeText = profile.resume_text;
  let filename = safeFilename(profile.full_name);

  if (matchId) {
    const { data: match } = await sb
      .from('matches')
      .select(
        `tailored_resume_text, tailored_resume_url,
         job:jobs(title, company)`,
      )
      .eq('id', matchId)
      .eq('profile_id', profileId)
      .maybeSingle();

    if (match) {
      const tailored = (match as { tailored_resume_text?: string | null })
        .tailored_resume_text;
      if (tailored) resumeText = tailored;
      const job = match.job as unknown as {
        title?: string;
        company?: string | null;
      };
      const label = [job?.company, job?.title].filter(Boolean).join('-');
      if (label) filename = safeFilename(label);
    }
  }

  const pdfDoc = generateBeautifulPdf(resumeText);
  const pdfArrayBuffer = pdfDoc.output('arraybuffer');
  return { buffer: Buffer.from(pdfArrayBuffer), filename };
}
