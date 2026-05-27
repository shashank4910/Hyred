/**
 * POST /api/match/[id]/auto-apply
 *
 * Orchestrates the full auto-apply flow:
 *  1. Fetch match + profile + apply_profile + job
 *  2. Ensure ATS resume is generated (if not already)
 *  3. Ensure PDF is uploaded to Supabase Storage (if not already)
 *  4. Ensure cover letter is generated (if not already)
 *  5. POST to the Python browser agent with all context
 *  6. Save task_id and mark match as auto_apply_status='running'
 *  7. Return task_id so the frontend can open the SSE stream
 */
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { generateAtsResume, generateCoverLetter } from '@/lib/gemini';
import { ensureFullDescription } from '@/lib/jd-fetcher';
import { generateBeautifulPdf } from '@/lib/pdf-resume';

export const runtime = 'nodejs';
export const maxDuration = 120;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const sb = supabaseAdmin();

  // ── 1. Fetch all data needed ──────────────────────────────────────────────
  const { data: match, error: matchErr } = await sb
    .from('matches')
    .select(
      `id, profile_id, status, cover_letter,
       tailored_resume_text, tailored_resume_url,
       profile:profiles(id, full_name, email, resume_text, insights),
       job:jobs(id, title, company, location, url, description, tags)`,
    )
    .eq('id', id)
    .single();

  if (matchErr || !match) {
    return NextResponse.json({ error: 'Match not found' }, { status: 404 });
  }

  const profile = match.profile as unknown as {
    id: string;
    full_name: string | null;
    email: string;
    resume_text: string | null;
    insights: { phone?: string; current_location?: string } | null;
  };

  const job = match.job as unknown as {
    id: string; title: string; company: string | null;
    location: string | null; url: string; description: string | null; tags: string[] | null;
  };

  const m = match as unknown as {
    tailored_resume_text: string | null;
    tailored_resume_url: string | null;
    cover_letter: string | null;
  };

  if (!profile?.resume_text) {
    return NextResponse.json({ error: 'No resume on profile. Add your resume first.' }, { status: 400 });
  }

  if (!job.url) {
    return NextResponse.json({ error: 'Job has no application URL.' }, { status: 400 });
  }

  // ── 2. Fetch apply profile (the memory store) ─────────────────────────────
  const { data: applyProfile } = await sb
    .from('apply_profiles')
    .select('*')
    .eq('profile_id', profile.id)
    .maybeSingle();

  const ap = (applyProfile ?? {}) as Record<string, unknown>;

  // ── 3. Ensure full JD ─────────────────────────────────────────────────────
  const fullDescription = await ensureFullDescription({
    jobId: job.id, currentDescription: job.description, url: job.url,
  }) ?? job.description ?? job.title;

  // ── 4. Ensure ATS resume text exists ─────────────────────────────────────
  let resumeText = m.tailored_resume_text;
  if (!resumeText) {
    const { resume } = await generateAtsResume({
      resumeText: profile.resume_text,
      jobTitle: job.title,
      jobCompany: job.company,
      jobDescription: fullDescription,
      candidateName: profile.full_name,
      email: profile.email,
      phone: profile.insights?.phone ?? (ap.phone as string | null) ?? null,
      location: profile.insights?.current_location ?? (ap.city as string | null) ?? null,
    });
    resumeText = resume;
    await sb.from('matches').update({ tailored_resume_text: resume }).eq('id', id);
  }

  // ── 5. Ensure PDF URL exists ──────────────────────────────────────────────
  let pdfUrl = m.tailored_resume_url;
  if (!pdfUrl) {
    const pdfDoc = generateBeautifulPdf(resumeText);
    const pdfBuffer = Buffer.from(pdfDoc.output('arraybuffer'));

    const safeName = (profile.full_name ?? 'resume')
      .toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').slice(0, 40);
    const filename = `${profile.id}/${id}-${safeName}.pdf`;

    const { error: uploadErr } = await sb.storage
      .from('resumes')
      .upload(filename, pdfBuffer, { contentType: 'application/pdf', upsert: true });

    if (!uploadErr) {
      const { data: urlData } = sb.storage.from('resumes').getPublicUrl(filename);
      pdfUrl = urlData.publicUrl;
      await sb.from('matches').update({ tailored_resume_url: pdfUrl }).eq('id', id);
    } else {
      // Non-fatal — agent will note it can't upload
      console.warn('PDF upload failed:', uploadErr.message);
      pdfUrl = '';
    }
  }

  // ── 6. Ensure cover letter exists ─────────────────────────────────────────
  let coverLetter = m.cover_letter;
  if (!coverLetter) {
    coverLetter = await generateCoverLetter({
      resume: profile.resume_text,
      candidateName: profile.full_name,
      jobTitle: job.title,
      jobCompany: job.company,
      jobDescription: fullDescription,
    });
    await sb.from('matches').update({ cover_letter: coverLetter }).eq('id', id);
  }

  // ── 7. Build callback URL ─────────────────────────────────────────────────
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? req.nextUrl.origin;
  const callbackUrl = `${appUrl}/api/match/${id}/apply-callback`;

  // ── 8. POST to Python agent ───────────────────────────────────────────────
  const agentUrl = process.env.APPLY_AGENT_URL;
  if (!agentUrl) {
    return NextResponse.json(
      { error: 'APPLY_AGENT_URL not configured. Deploy the browser_agent service first.' },
      { status: 503 },
    );
  }

  const agentPayload = {
    match_id: id,
    job_url: job.url,
    job_title: job.title,
    company: job.company,
    resume_pdf_url: pdfUrl,
    resume_text: resumeText,
    cover_letter: coverLetter,
    // Personal info
    full_name: profile.full_name ?? (ap.full_name as string) ?? '',
    email: profile.email,
    phone: profile.insights?.phone ?? (ap.phone as string) ?? '',
    city: (ap.city as string) ?? profile.insights?.current_location ?? '',
    country: (ap.country as string) ?? 'India',
    linkedin_url: (ap.linkedin_url as string) ?? null,
    github_url: (ap.github_url as string) ?? null,
    portfolio_url: (ap.portfolio_url as string) ?? null,
    current_title: (ap.current_title as string) ?? null,
    years_experience: (ap.years_experience as number) ?? null,
    expected_ctc: (ap.expected_ctc as string) ?? null,
    notice_period: (ap.notice_period as string) ?? '30 days',
    willing_to_relocate: (ap.willing_to_relocate as boolean) ?? false,
    relocation_cities: (ap.relocation_cities as string) ?? null,
    work_auth_country: (ap.work_auth_country as string) ?? 'India',
    authorized_to_work: (ap.authorized_to_work as boolean) ?? true,
    require_sponsorship: (ap.require_sponsorship as boolean) ?? false,
    gender: (ap.gender as string) ?? null,
    veteran_status: (ap.veteran_status as string) ?? 'No',
    disability_status: (ap.disability_status as string) ?? 'No',
    answer_about_yourself: (ap.answer_about_yourself as string) ?? null,
    answer_why_leave: (ap.answer_why_leave as string) ?? null,
    answer_strengths: (ap.answer_strengths as string) ?? null,
    answer_weaknesses: (ap.answer_weaknesses as string) ?? null,
    answer_salary_expectation: (ap.answer_salary_expectation as string) ?? null,
    // Callback
    jobradar_callback_url: callbackUrl,
    jobradar_api_secret: process.env.INGEST_SECRET ?? '',
  };

  let taskId: string;
  try {
    const agentRes = await fetch(`${agentUrl}/apply`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(agentPayload),
    });
    if (!agentRes.ok) {
      const errText = await agentRes.text();
      throw new Error(`Agent returned ${agentRes.status}: ${errText}`);
    }
    const agentData = await agentRes.json();
    taskId = agentData.task_id;
  } catch (e) {
    return NextResponse.json(
      { error: `Failed to start agent: ${(e as Error).message}` },
      { status: 502 },
    );
  }

  // ── 9. Update match row with running status ───────────────────────────────
  await sb.from('matches').update({
    auto_apply_status: 'running',
    auto_apply_started_at: new Date().toISOString(),
    auto_apply_log: '',
  }).eq('id', id);

  return NextResponse.json({ ok: true, task_id: taskId, agent_url: agentUrl });
}
