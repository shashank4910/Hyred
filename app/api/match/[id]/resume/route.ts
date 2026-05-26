import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { supabaseAdmin } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * POST /api/match/[id]/resume
 *
 * Generates an ATS-optimized plain-text resume tailored to the specific
 * job description. The AI:
 *   - Reorders sections/bullets to front-load the most relevant experience
 *   - Injects matching keywords from the JD naturally into bullet points
 *   - Emphasizes transferable skills that map to requirements
 *   - Uses a clean, ATS-parseable plain-text format (no tables, columns, graphics)
 *   - NEVER invents fake experience, certifications, or skills
 *
 * Returns: { ok: true, resume: string }
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const sb = supabaseAdmin();

  const { data: match, error: matchErr } = await sb
    .from('matches')
    .select(
      `id, profile_id,
       profile:profiles(full_name, email, resume_text, insights),
       job:jobs(title, company, location, description, tags)`,
    )
    .eq('id', id)
    .single();

  if (matchErr || !match) {
    return NextResponse.json(
      { error: matchErr?.message ?? 'Match not found' },
      { status: 404 },
    );
  }

  const profile = match.profile as unknown as {
    full_name: string | null;
    email: string;
    resume_text: string | null;
    insights: {
      phone?: string;
      current_location?: string;
      top_skills?: string[];
    } | null;
  };
  const job = match.job as unknown as {
    title: string;
    company: string | null;
    location: string | null;
    description: string | null;
    tags: string[] | null;
  };

  if (!profile?.resume_text) {
    return NextResponse.json(
      { error: 'No resume text found in profile' },
      { status: 400 },
    );
  }
  if (!job?.description) {
    return NextResponse.json(
      { error: 'Job has no description to optimize against' },
      { status: 400 },
    );
  }

  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    return NextResponse.json(
      { error: 'OPENAI_API_KEY not configured' },
      { status: 500 },
    );
  }

  const client = new OpenAI({ apiKey: key });

  const prompt = `You are an expert resume writer who specializes in getting resumes past Applicant Tracking Systems (ATS).

Given the candidate's current resume and a target job description, rewrite the resume to maximize ATS compatibility and relevance scoring for THIS specific job.

RULES (critical):
1. NEVER invent fake experience, certifications, degrees, companies, or skills the candidate doesn't have.
2. DO reorder sections and bullets so the most relevant experience appears first.
3. DO naturally incorporate keywords from the JD into existing bullet points where truthful.
4. DO quantify achievements where the original resume already implies them.
5. DO use a clean plain-text format: no tables, no columns, no graphics, no special characters.
6. DO include a targeted "Summary" section (2-3 lines) at the top highlighting fit for THIS role.
7. DO include a "Key Skills" section that mirrors the JD's required skills (only skills the candidate actually has).
8. Keep the resume to ~1 page worth of text (roughly 400-600 words).
9. Use the format: SECTION HEADERS IN CAPS, bullet points with "- " prefix.
10. Contact info at the top: Name, Email, Phone, Location, LinkedIn (if available).

CANDIDATE'S CURRENT RESUME:
${profile.resume_text.slice(0, 7000)}

TARGET JOB:
Title: ${job.title}
Company: ${job.company ?? 'Not specified'}
Location: ${job.location ?? 'Not specified'}
Description:
${job.description.slice(0, 5000)}

${job.tags?.length ? `Tags/Keywords: ${job.tags.join(', ')}` : ''}

CANDIDATE CONTACT INFO (use these exactly):
Name: ${profile.full_name ?? 'Not provided'}
Email: ${profile.email}
${profile.insights?.phone ? `Phone: ${profile.insights.phone}` : ''}
${profile.insights?.current_location ? `Location: ${profile.insights.current_location}` : ''}

Output the complete ATS-optimized resume in plain text. No preamble, no explanation — just the resume.`;

  try {
    const res = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.4,
      messages: [
        {
          role: 'system',
          content:
            'You rewrite resumes to pass ATS systems. Output clean plain text only. Never fabricate experience.',
        },
        { role: 'user', content: prompt },
      ],
    });

    const resume = (res.choices[0]?.message?.content ?? '').trim();
    if (!resume || resume.length < 200) {
      return NextResponse.json(
        { error: 'Generated resume was too short' },
        { status: 500 },
      );
    }

    return NextResponse.json({ ok: true, resume });
  } catch (e) {
    return NextResponse.json(
      { error: `Resume generation failed: ${(e as Error).message}` },
      { status: 500 },
    );
  }
}
