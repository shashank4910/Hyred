import { NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { isExtAuthed } from '@/lib/extension/auth';
import { corsPreflight, corsResponse } from '@/lib/extension/cors';
import { chat } from '@/lib/gemini';

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function OPTIONS() {
  return corsPreflight();
}

/**
 * POST /api/extension/answer
 * Body: { question: string, match_id?: string, page_text?: string, max_words?: number }
 *
 * Generate a tailored answer to a screening question. Uses:
 *   - the candidate resume (always)
 *   - the job description (if match_id given) or page_text (page context)
 *
 * Examples of questions we answer well:
 *   "Why are you interested in this role?"
 *   "What's your relevant experience with X?"
 *   "Why this company?"
 */
export async function POST(req: NextRequest) {
  const auth = await isExtAuthed(req);
  if (!auth) {
    return corsResponse({ error: 'unauthorized' }, { status: 401 });
  }

  let body: {
    question?: string;
    match_id?: string;
    page_text?: string;
    max_words?: number;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return corsResponse({ error: 'invalid body' }, { status: 400 });
  }
  const question = body.question?.trim();
  if (!question || question.length < 5) {
    return corsResponse({ error: 'question required' }, { status: 400 });
  }
  const maxWords = Math.max(20, Math.min(body.max_words ?? 120, 400));

  const sb = supabaseAdmin();
  let query = sb.from('profiles').select('full_name, resume_text');
  if (auth.profile_id) {
    query = query.eq('id', auth.profile_id);
  } else {
    query = query.order('created_at').limit(1);
  }
  const { data: profile } = await query.maybeSingle();
  if (!profile?.resume_text) {
    return corsResponse({ error: 'no resume on file' }, { status: 400 });
  }

  // Resolve job context.
  let jobTitle = '';
  let jobCompany = '';
  let jobDescription = body.page_text?.trim() ?? '';

  if (body.match_id) {
    let matchQuery = sb
      .from('matches')
      .select(`job:jobs(title, company, description)`)
      .eq('id', body.match_id);
    if (auth.profile_id) {
      matchQuery = matchQuery.eq('profile_id', auth.profile_id);
    }
    const { data: match } = await matchQuery.maybeSingle();
    if (match) {
      const job = match.job as unknown as {
        title: string;
        company: string | null;
        description: string | null;
      };
      jobTitle = job.title;
      jobCompany = job.company ?? '';
      if (!jobDescription && job.description) jobDescription = job.description;
    }
  }

  const systemPrompt =
    "You write candid, concrete first-person answers to job application screening questions, grounded in the candidate's actual resume.";

  const userPrompt = `You are helping the candidate answer a screening question on a job application.
Write the answer in the candidate's first-person voice. Be specific, draw on concrete experience from their resume, and tie back to the job context. Avoid clichés ("I am passionate about", "I am a hard-working professional"). No emojis. No preamble.
Length: max ${maxWords} words.

CANDIDATE NAME: ${profile.full_name ?? 'the candidate'}

CANDIDATE RESUME:
${profile.resume_text.slice(0, 5000)}

JOB CONTEXT:
${jobTitle ? `Title: ${jobTitle}\n` : ''}${jobCompany ? `Company: ${jobCompany}\n` : ''}${jobDescription ? `Description / page text:\n${jobDescription.slice(0, 4000)}\n` : ''}

QUESTION:
${question}

Output the answer text only.`;

  try {
    const answer = await chat(
      systemPrompt,
      userPrompt,
      0.5,
      false,
      'extensionAnswer',
      auth.profile_id ?? undefined,
    );
    return corsResponse({ ok: true, answer });
  } catch (e) {
    return corsResponse(
      { error: `LLM failed: ${(e as Error).message}` },
      { status: 500 },
    );
  }
}
