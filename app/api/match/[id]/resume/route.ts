import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { ensureFullDescription } from '@/lib/jd-fetcher';
import { generateAtsResume } from '@/lib/gemini';

export const runtime = 'nodejs';
export const maxDuration = 120;

/**
 * GET /api/match/[id]/resume
 * Returns keywords from the JD split into "already have" vs "available to add".
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const sb = supabaseAdmin();

  const { data: match, error } = await sb
    .from('matches')
    .select(`id, profile:profiles(resume_text), job:jobs(id, description, tags, url)`)
    .eq('id', id)
    .single();

  if (error || !match) {
    return NextResponse.json({ error: error?.message ?? 'Not found' }, { status: 404 });
  }

  const profile = match.profile as unknown as { resume_text: string | null };
  const job = match.job as unknown as {
    id: string; description: string | null; tags: string[] | null; url: string | null;
  };

  const fullDescription = await ensureFullDescription({
    jobId: job.id, currentDescription: job.description, url: job.url,
  });

  if (!fullDescription) return NextResponse.json({ keywords: [], alreadyHave: [] });

  const jdKeywords = extractKeywords(fullDescription.toLowerCase());
  if (job.tags?.length) {
    for (const tag of job.tags) {
      const lower = tag.toLowerCase();
      if (!jdKeywords.some(k => k.toLowerCase() === lower)) jdKeywords.push(tag);
    }
  }

  const resumeLower = (profile?.resume_text ?? '').toLowerCase();
  const alreadyHave: string[] = [];
  const available: string[] = [];

  for (const kw of jdKeywords) {
    if (resumeLower.includes(kw.toLowerCase())) alreadyHave.push(kw);
    else available.push(kw);
  }

  return NextResponse.json({
    keywords: [...new Set([...available, ...alreadyHave])],
    alreadyHave: [...new Set(alreadyHave)],
  });
}

/**
 * POST /api/match/[id]/resume
 * Generates an ATS-optimised resume for this job match using Gemini 2.0 Flash.
 * Saves the plain-text result to matches.tailored_resume_text.
 * Accepts optional body: { selectedKeywords?: string[] }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const sb = supabaseAdmin();

  let selectedKeywords: string[] = [];
  try {
    const body = await req.json();
    if (Array.isArray(body?.selectedKeywords)) {
      selectedKeywords = body.selectedKeywords.map(String).slice(0, 30);
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
    .single();

  if (matchErr || !match) {
    return NextResponse.json({ error: matchErr?.message ?? 'Not found' }, { status: 404 });
  }

  const profile = match.profile as unknown as {
    full_name: string | null;
    email: string;
    resume_text: string | null;
    insights: { phone?: string; current_location?: string } | null;
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

  // Generate ATS resume via Gemini
  const { resume, added, alreadyHad } = await generateAtsResume({
    resumeText: profile.resume_text,
    jobTitle: job.title,
    jobCompany: job.company,
    jobDescription: fullDescription,
    candidateName: profile.full_name,
    email: profile.email,
    phone: profile.insights?.phone,
    location: profile.insights?.current_location,
    selectedKeywords,
  });

  if (!resume || resume.length < 200) {
    return NextResponse.json({ error: 'Generated resume too short' }, { status: 500 });
  }

  // Save plain-text resume to DB (tailored_resume_text column)
  await sb
    .from('matches')
    .update({ tailored_resume_text: resume })
    .eq('id', id);

  return NextResponse.json({
    ok: true,
    resume,
    keywords: {
      added: [...new Set(added)].slice(0, 20),
      already_had: [...new Set(alreadyHad)].slice(0, 20),
      total_jd_keywords: extractKeywords(fullDescription.toLowerCase()).length,
      selected_count: selectedKeywords.length,
    },
  });
}

function extractKeywords(jd: string): string[] {
  const keywords = new Set<string>();
  const patterns = [
    /\b(?:jmeter|loadrunner|gatling|blazemeter|k6|cavisson|netdynamics|locust|neoload)\b/gi,
    /\b(?:kubernetes|docker|jenkins|terraform|ansible|aws|azure|gcp|azure devops)\b/gi,
    /\b(?:java|python|javascript|typescript|golang|rust|scala|groovy)\b/gi,
    /\b(?:spring boot|react|angular|vue|next\.?js|node\.?js)\b/gi,
    /\b(?:sql|postgresql|mysql|mongodb|redis|elasticsearch|kafka)\b/gi,
    /\b(?:ci\/cd|devops|microservices|rest api|graphql|grpc|shift-left)\b/gi,
    /\b(?:agile|scrum|kanban|jira|confluence)\b/gi,
    /\b(?:appdynamics|dynatrace|splunk|grafana|prometheus|datadog|new relic|opentelemetry)\b/gi,
    /\b(?:performance testing|load testing|stress testing|endurance testing|scalability testing)\b/gi,
    /\b(?:capacity planning|workload modeling|root cause analysis|nfr|sla|slo|sli)\b/gi,
    /\b(?:jprofile?r|jvisualvm|eclipse mat|fiddler|chrome devtools|awr)\b/gi,
    /\b(?:postman|soapui|swagger)\b/gi,
    /\b(?:git|github|gitlab|bitbucket)\b/gi,
    /\b(?:distributed load testing|cloud performance testing|websocket|http\/2)\b/gi,
    /\b(?:thread dump|heap dump|gc tuning|memory leak|throughput|latency|percentile)\b/gi,
    /\b(?:rancher|rally|octane)\b/gi,
  ];
  for (const re of patterns) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(jd)) !== null) keywords.add(m[0].trim());
  }
  return [...keywords];
}
