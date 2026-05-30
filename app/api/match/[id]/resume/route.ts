import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { getCurrentProfile } from '@/lib/current-user';
import { ensureFullDescription } from '@/lib/jd-fetcher';
import { generateAtsResume, extractJdKeywordsTyped, keywordInText, type KeywordType } from '@/lib/gemini';

export const runtime = 'nodejs';
export const maxDuration = 120;

/**
 * GET /api/match/[id]/resume
 * Returns the JD-extracted ATS keywords split into "already in resume" vs
 * "available to add". Uses the same LLM-based extraction as the generator
 * so the picker and the generator always agree on what THIS specific JD
 * is asking for.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const profile0 = await getCurrentProfile();
  if (!profile0) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const sb = supabaseAdmin();

  const { data: match, error } = await sb
    .from('matches')
    .select(`id, profile:profiles(resume_text), job:jobs(id, title, description, tags, url)`)
    .eq('id', id)
    .eq('profile_id', profile0.id)
    .single();

  if (error || !match) {
    return NextResponse.json({ error: error?.message ?? 'Not found' }, { status: 404 });
  }

  const profile = match.profile as unknown as { resume_text: string | null };
  const job = match.job as unknown as {
    id: string; title: string; description: string | null; tags: string[] | null; url: string | null;
  };

  const fullDescription = await ensureFullDescription({
    jobId: job.id, currentDescription: job.description, url: job.url,
  });

  if (!fullDescription) return NextResponse.json({ keywords: [], alreadyHave: [], keywordTypes: {} });

  // LLM-based extraction + per-keyword type (tool vs activity) — the same
  // typed function the generator uses. The type is decided by the model here,
  // once, and ferried to the POST so placement stays consistent and scalable.
  const typed = await extractJdKeywordsTyped({
    jobTitle: job.title,
    jobDescription: fullDescription,
  });

  // Fall back to the job's existing tags if the LLM returned nothing.
  const finalTyped = typed.length > 0
    ? typed
    : (job.tags ?? []).map((t) => ({ keyword: t, type: 'activity' as KeywordType }));

  const keywordTypes: Record<string, KeywordType> = {};
  for (const t of finalTyped) keywordTypes[t.keyword] = t.type;
  const finalKeywords = finalTyped.map((t) => t.keyword);

  // Whole-token matching (keywordInText) — same matcher the generator uses for
  // its ATS score — so the picker's "already have" split agrees with the
  // generator instead of diverging on substring false positives.
  const resumeText = profile?.resume_text ?? '';
  const alreadyHave: string[] = [];
  const available: string[] = [];

  for (const kw of finalKeywords) {
    if (keywordInText(kw, resumeText)) alreadyHave.push(kw);
    else available.push(kw);
  }

  return NextResponse.json({
    keywords: [...new Set([...available, ...alreadyHave])],
    alreadyHave: [...new Set(alreadyHave)],
    keywordTypes,
  });
}

/**
 * POST /api/match/[id]/resume
 * Generates an ATS-tailored resume for this job match.
 * Two-pass: first extracts JD keywords, then rebuilds the resume around them.
 * Saves the plain-text result to matches.tailored_resume_text.
 * Accepts optional body: { selectedKeywords?: string[] }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const profile0 = await getCurrentProfile();
  if (!profile0) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const sb = supabaseAdmin();

  let selectedKeywords: string[] = [];
  let excludedKeywords: string[] = [];
  // The client passes the JD keyword list it is already displaying so the
  // keyword universe stays STABLE across regenerations. Without this the POST
  // would re-extract keywords from scratch and the set could drift between the
  // picker (GET) and the result (POST) due to LLM non-determinism, making chips
  // appear/disappear after optimizing. It also saves one LLM call per generate.
  let clientJdKeywords: string[] = [];
  // LLM-decided keyword types (tool vs activity), captured by the GET route and
  // sent back so placement is driven by the model's judgement, not a heuristic.
  let clientKeywordTypes: Record<string, KeywordType> = {};
  try {
    const body = await req.json();
    if (Array.isArray(body?.selectedKeywords)) {
      selectedKeywords = body.selectedKeywords.map(String).slice(0, 40);
    }
    if (Array.isArray(body?.excludedKeywords)) {
      excludedKeywords = body.excludedKeywords.map(String).slice(0, 40);
    }
    if (Array.isArray(body?.jdKeywords)) {
      clientJdKeywords = body.jdKeywords.map(String).slice(0, 60);
    }
    if (body?.keywordTypes && typeof body.keywordTypes === 'object') {
      for (const [k, v] of Object.entries(body.keywordTypes as Record<string, unknown>)) {
        if (v === 'tool' || v === 'activity') clientKeywordTypes[k] = v;
      }
    }
  } catch { /* no body */ }

  const { data: match, error: matchErr } = await sb
    .from('matches')
    .select(
      `id, profile_id,
       profile:profiles(full_name, email, resume_text, insights),
       job:jobs(id, title, company, location, description, tags, url)`,
    )
    .eq('id', id)
    .eq('profile_id', profile0.id)
    .single();

  if (matchErr || !match) {
    return NextResponse.json({ error: matchErr?.message ?? 'Not found' }, { status: 404 });
  }

  const profile = match.profile as unknown as {
    full_name: string | null;
    email: string;
    resume_text: string | null;
    insights: { phone?: string; current_location?: string; years_experience?: number } | null;
  };
  const job = match.job as unknown as {
    id: string; title: string; company: string | null;
    location: string | null; description: string | null;
    tags: string[] | null; url: string | null;
  };

  if (!profile?.resume_text) {
    return NextResponse.json({ error: 'No resume text found' }, { status: 400 });
  }

  const fullDescription = await ensureFullDescription({
    jobId: job.id, currentDescription: job.description, url: job.url,
  });

  if (!fullDescription) {
    return NextResponse.json({ error: 'No job description to optimise against' }, { status: 400 });
  }

  // Two-pass ATS-tailored generation. Reuse the client-supplied JD keywords when
  // present (stable universe); generateAtsResume falls back to extracting them
  // itself if the list is empty.
  const result = await generateAtsResume({
    resumeText: profile.resume_text,
    jobTitle: job.title,
    jobCompany: job.company,
    jobDescription: fullDescription,
    candidateName: profile.full_name,
    email: profile.email,
    phone: profile.insights?.phone,
    location: profile.insights?.current_location,
    selectedKeywords,
    excludedKeywords,
    jdKeywords: clientJdKeywords.length > 0 ? clientJdKeywords : undefined,
    keywordTypes: Object.keys(clientKeywordTypes).length > 0 ? clientKeywordTypes : undefined,
  });

  if (!result.resume || result.resume.length < 200) {
    return NextResponse.json({ error: 'Generated resume too short' }, { status: 500 });
  }

  // Save plain-text resume to DB
  await sb
    .from('matches')
    .update({ tailored_resume_text: result.resume })
    .eq('id', id);

  // Build a recruiter-friendly default download filename:
  //   {FirstName}_{Specialization}_{Years}
  // e.g. "Shashank_Performance_7.7"
  const filename_base = buildResumeFilenameBase({
    fullName: profile.full_name,
    jobTitle: job.title,
    yearsExperience: profile.insights?.years_experience,
  });

  return NextResponse.json({
    ok: true,
    resume: result.resume,
    filename_base,
    keywords: {
      added: [...new Set(result.added)].slice(0, 25),
      already_had: [...new Set(result.alreadyHad)].slice(0, 25),
      missing: [...new Set(result.missing)].slice(0, 25),
      total_jd_keywords: result.jd_keywords.length,
      selected_count: selectedKeywords.length,
      ats_match_score: result.ats_match_score,
    },
  });
}

/**
 * Build the default download filename base for the generated resume.
 * Format: {FirstName}_{Specialization}_{Years}
 * Example: "Shashank_Performance_7.7"
 *
 * - First name: first word of the candidate's full_name, A-Z only.
 *   Falls back to "Candidate" if the profile has no name.
 * - Specialization: the first non-seniority word of the JD title (Senior /
 *   Sr / Lead / Principal / Junior / Jr / Associate / Staff are skipped),
 *   stripped to letters, capitalized. Falls back to "Role".
 * - Years: profile.insights.years_experience if a positive number; omitted
 *   from the filename when unknown (never hard-code another user's tenure).
 *
 * The returned string is filesystem-safe (only [A-Za-z0-9._]). Caller
 * appends ".pdf" / ".txt".
 */
function buildResumeFilenameBase(args: {
  fullName: string | null;
  jobTitle: string;
  yearsExperience: number | null | undefined;
}): string {
  const safe = (s: string) => s.replace(/[^A-Za-z0-9]/g, '');

  const firstName =
    safe((args.fullName ?? '').trim().split(/\s+/)[0] ?? '') || 'Candidate';

  const stopWords = new Set([
    'senior', 'sr', 'lead', 'principal', 'junior', 'jr', 'associate', 'staff',
  ]);
  let specialization = 'Role';
  for (const w of (args.jobTitle ?? '').split(/\s+/)) {
    const cleaned = safe(w);
    if (cleaned.length >= 2 && !stopWords.has(cleaned.toLowerCase())) {
      specialization = cleaned.charAt(0).toUpperCase() + cleaned.slice(1).toLowerCase();
      break;
    }
  }

  const yearsRaw =
    typeof args.yearsExperience === 'number' && args.yearsExperience > 0
      ? args.yearsExperience
      : null;
  if (yearsRaw == null) return `${firstName}_${specialization}`;

  const yearsStr = Number.isInteger(yearsRaw)
    ? String(yearsRaw)
    : yearsRaw.toFixed(1);

  return `${firstName}_${specialization}_${yearsStr}`;
}
