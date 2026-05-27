import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { supabaseAdmin } from '@/lib/supabase/server';
import { ensureFullDescription } from '@/lib/jd-fetcher';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * GET /api/match/[id]/resume
 *
 * Extracts keywords from the job description so the keyword picker
 * can present them to the user. Also returns which keywords are
 * already present in the user's resume.
 *
 * Returns: { keywords: string[], alreadyHave: string[] }
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const sb = supabaseAdmin();

  const { data: match, error: matchErr } = await sb
    .from('matches')
    .select(
      `id,
       profile:profiles(resume_text),
       job:jobs(id, description, tags, url)`,
    )
    .eq('id', id)
    .single();

  if (matchErr || !match) {
    return NextResponse.json(
      { error: matchErr?.message ?? 'Match not found' },
      { status: 404 },
    );
  }

  const profile = match.profile as unknown as { resume_text: string | null };
  const job = match.job as unknown as {
    id: string;
    description: string | null;
    tags: string[] | null;
    url: string | null;
  };

  // Ensure we have the full JD (Adzuna search API truncates to 500 chars).
  const fullDescription = await ensureFullDescription({
    jobId: job.id,
    currentDescription: job.description,
    url: job.url,
  });

  if (!fullDescription) {
    return NextResponse.json({ keywords: [], alreadyHave: [] });
  }

  const jdKeywords = extractKeywords(fullDescription.toLowerCase());

  // Also add job tags that aren't already extracted
  if (job.tags?.length) {
    for (const tag of job.tags) {
      const lower = tag.toLowerCase();
      if (!jdKeywords.some(k => k.toLowerCase() === lower)) {
        jdKeywords.push(tag);
      }
    }
  }

  const resumeLower = (profile?.resume_text ?? '').toLowerCase();
  const alreadyHave: string[] = [];
  const available: string[] = [];

  for (const kw of jdKeywords) {
    if (resumeLower.includes(kw.toLowerCase())) {
      alreadyHave.push(kw);
    } else {
      available.push(kw);
    }
  }

  return NextResponse.json({
    keywords: [...new Set([...available, ...alreadyHave])],
    alreadyHave: [...new Set(alreadyHave)],
  });
}

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
 * Accepts optional body: { selectedKeywords?: string[] }
 * If provided, the AI is specifically instructed to incorporate those keywords.
 *
 * Returns: { ok: true, resume: string, keywords: {...} }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const sb = supabaseAdmin();

  // Parse optional body
  let selectedKeywords: string[] = [];
  try {
    const body = await req.json();
    if (Array.isArray(body?.selectedKeywords)) {
      selectedKeywords = body.selectedKeywords.map(String).slice(0, 30);
    }
  } catch {
    // No body or invalid JSON — that's fine, proceed without selected keywords
  }

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
      summary?: string;
      years_experience?: number;
      seniority?: string;
    } | null;
  };
  const job = match.job as unknown as {
    id: string;
    title: string;
    company: string | null;
    location: string | null;
    description: string | null;
    tags: string[] | null;
    url: string | null;
  };

  if (!profile?.resume_text) {
    return NextResponse.json(
      { error: 'No resume text found in profile' },
      { status: 400 },
    );
  }

  // Ensure we have the full JD before generating the ATS resume.
  const fullDescription = await ensureFullDescription({
    jobId: job.id,
    currentDescription: job.description,
    url: job.url,
  });

  if (!fullDescription) {
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

  // Build keyword injection instructions — ONLY selected keywords, nothing else
  const keywordInstructions = selectedKeywords.length > 0
    ? `\n\nUSER-SELECTED KEYWORDS TO ADD:\nThe user has EXPLICITLY chosen these keywords to include. Intelligently embed ONLY these specific keywords into the resume — weave them naturally into existing bullet points, the summary, or the skills section:\n${selectedKeywords.map(k => `  - ${k}`).join('\n')}\n\nFor each selected keyword above, find a natural place to mention it in an existing bullet point or skills. If you cannot truthfully incorporate a keyword based on existing experience, SKIP IT — do not fabricate context.\n`
    : '\nThe user has NOT selected any additional keywords. Do NOT add any skills, tools, or technologies that are not already in the original resume. Only reformat the content.\n';

  const prompt = `You are an expert resume writer. Your job is to take the candidate's FULL original resume and output it in a clean ATS-friendly format WITH their selected keywords intelligently embedded.

CRITICAL RULES:
1. PRESERVE ALL CONTENT from the original resume. Do NOT trim, shorten, or remove any experience, projects, education, or achievements. The output must be at LEAST as long as the input.
2. NEVER add skills, tools, technologies, certifications, or experiences that are NOT in the original resume.
3. NEVER add "selenium", "cypress", "playwright", "karate", or ANY tool/technology unless it literally appears in the CANDIDATE'S CURRENT RESUME below.
4. The ONLY new keywords you may add are the ones listed in "USER-SELECTED KEYWORDS TO ADD" (if any). Weave them smartly into existing bullet points.
5. Do NOT shorten bullet points. Do NOT summarize sections. Keep ALL details.
6. You MAY reorder sections/bullets to put the most relevant ones first for the target job.
7. You MAY rephrase bullets slightly to incorporate selected keywords naturally.
8. You MAY add a brief "Professional Summary" (2-3 lines) at the top using facts already in the resume.

FORMATTING RULES:
1. Use clean plain-text: no tables, no columns, no graphics, no special characters.
2. SECTION HEADERS IN CAPS, bullet points with "- " prefix.
3. Contact info at the top: Name, Email, Phone, Location (as found in original).
4. Include a "Key Skills" section listing ALL skills from the original resume + user-selected keywords.
5. Keep ALL work experiences, ALL bullet points, ALL education, ALL projects/certifications from the original.
6. The resume can be 1-3 pages — length is NOT a constraint. Completeness is required.
${keywordInstructions}
CANDIDATE'S CURRENT RESUME (OUTPUT EVERYTHING — do not trim or shorten):
${profile.resume_text.slice(0, 12000)}

TARGET JOB (use ONLY for reordering relevance — do NOT add skills from here):
Title: ${job.title}
Company: ${job.company ?? 'Not specified'}
Location: ${job.location ?? 'Not specified'}
Description (first 3000 chars for context):
${fullDescription.slice(0, 3000)}

${job.tags?.length ? `Tags/Keywords: ${job.tags.join(', ')}` : ''}

CANDIDATE CONTACT INFO (use these exactly):
Name: ${profile.full_name ?? 'Not provided'}
Email: ${profile.email}
${profile.insights?.phone ? `Phone: ${profile.insights.phone}` : ''}
${profile.insights?.current_location ? `Location: ${profile.insights.current_location}` : ''}

Output the COMPLETE reformatted resume. Include ALL sections, ALL bullet points, ALL experiences. Do not trim. No preamble — just the resume.`;

  try {
    const res = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.4,
      max_tokens: 4096,
      messages: [
        {
          role: 'system',
          content:
            'You reformat existing resumes into clean ATS-friendly plain text. You PRESERVE ALL content — never shorten or trim. You NEVER add new skills or tools unless explicitly listed in user-selected keywords. Output the FULL resume.',
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

    // --- Keyword analysis: what was injected vs already present ---
    const originalLower = (profile.resume_text ?? '').toLowerCase();

    // Extract meaningful multi-word and single-word terms from the JD
    const jdKeywords = extractKeywords(fullDescription.toLowerCase());

    // Also consider the user-selected keywords for tracking
    for (const kw of selectedKeywords) {
      if (!jdKeywords.some(k => k.toLowerCase() === kw.toLowerCase())) {
        jdKeywords.push(kw);
      }
    }

    const added: string[] = [];
    const alreadyHad: string[] = [];

    for (const kw of jdKeywords) {
      const inResume = originalLower.includes(kw.toLowerCase());
      const inGenerated = resume.toLowerCase().includes(kw.toLowerCase());
      if (inGenerated && !inResume) {
        added.push(kw);
      } else if (inGenerated && inResume) {
        alreadyHad.push(kw);
      }
    }

    return NextResponse.json({
      ok: true,
      resume,
      keywords: {
        added: [...new Set(added)].slice(0, 20),
        already_had: [...new Set(alreadyHad)].slice(0, 20),
        total_jd_keywords: jdKeywords.length,
        selected_count: selectedKeywords.length,
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: `Resume generation failed: ${(e as Error).message}` },
      { status: 500 },
    );
  }
}

/**
 * Extract likely skill/technology keywords from JD text.
 * Looks for capitalized terms, known patterns, and terms near
 * "experience with", "proficiency in", "knowledge of", etc.
 */
function extractKeywords(jd: string): string[] {
  const keywords = new Set<string>();

  // Common tech terms pattern (2-3 word phrases and single words)
  const patterns = [
    /\b(?:jmeter|loadrunner|gatling|blazemeter|cavisson|netdynamics)\b/gi,
    /\b(?:kubernetes|docker|jenkins|terraform|ansible|aws|azure|gcp)\b/gi,
    /\b(?:java|python|javascript|typescript|golang|rust|scala|kotlin)\b/gi,
    /\b(?:spring boot|react|angular|vue|next\.?js|node\.?js|express)\b/gi,
    /\b(?:sql|postgresql|mysql|mongodb|redis|elasticsearch|kafka)\b/gi,
    /\b(?:ci\/cd|devops|microservices|rest api|graphql|grpc)\b/gi,
    /\b(?:agile|scrum|kanban|jira|confluence)\b/gi,
    /\b(?:appdynamics|dynatrace|splunk|grafana|prometheus|datadog|new relic)\b/gi,
    /\b(?:selenium|cypress|playwright|cucumber|karate)\b/gi,
    /\b(?:performance testing|load testing|stress testing|api testing|test automation)\b/gi,
    /\b(?:machine learning|deep learning|data science|nlp|computer vision)\b/gi,
    /\b(?:figma|sketch|adobe xd|storybook|tailwind|sass|css)\b/gi,
    /\b(?:git|github|gitlab|bitbucket)\b/gi,
    /\b(?:linux|unix|windows server|macos)\b/gi,
    /\b(?:communication skills|problem solving|team lead|stakeholder|cross-functional)\b/gi,
    /\b(?:s3|ec2|lambda|ecs|fargate|cloudformation|cdk|serverless)\b/gi,
    /\b(?:oauth|jwt|sso|saml|openid)\b/gi,
    /\b(?:webpack|vite|babel|eslint|prettier)\b/gi,
    /\b(?:swift|objective-c|flutter|react native|android|ios)\b/gi,
    /\b(?:hadoop|spark|airflow|dbt|snowflake|bigquery|redshift)\b/gi,
    /\b(?:rabbitmq|sqs|sns|pubsub|event-driven)\b/gi,
    /\b(?:pytorch|tensorflow|scikit-learn|pandas|numpy)\b/gi,
  ];

  for (const re of patterns) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(jd)) !== null) {
      keywords.add(m[0].trim());
    }
  }

  return [...keywords];
}
