/**
 * AI helpers — powered by Google Gemini 2.0 Flash.
 *
 * All previous OpenAI calls have been migrated to Gemini 2.0 Flash.
 * Embeddings use text-embedding-004 (768 dims — note: Supabase vector
 * column must be updated if it was 1536 for OpenAI; keep 768 going forward).
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import type { ResumeInsights } from './types';

const CHAT_MODEL = 'gemini-2.0-flash';
const EMBED_MODEL = 'text-embedding-004';

function getClient(): GoogleGenerativeAI {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('Missing GEMINI_API_KEY env var');
  return new GoogleGenerativeAI(key);
}

async function chat(
  systemPrompt: string,
  userPrompt: string,
  temperature = 0.3,
  jsonMode = false,
): Promise<string> {
  const genAI = getClient();
  const model = genAI.getGenerativeModel({
    model: CHAT_MODEL,
    generationConfig: {
      temperature,
      ...(jsonMode ? { responseMimeType: 'application/json' } : {}),
    },
    systemInstruction: systemPrompt,
  });
  const result = await model.generateContent(userPrompt);
  return result.response.text().trim();
}

/**
 * Embed a piece of text using text-embedding-004 (768 dims).
 */
export async function embed(text: string): Promise<number[]> {
  const genAI = getClient();
  const model = genAI.getGenerativeModel({ model: EMBED_MODEL });
  const trimmed = text.slice(0, 8000);
  const result = await model.embedContent(trimmed);
  return result.embedding.values;
}

/**
 * Score a job against a resume on a 0–100 scale and return short reasoning.
 */
export async function scoreJob(args: {
  resume: string;
  preferences?: string;
  jobTitle: string;
  jobCompany: string | null;
  jobLocation: string | null;
  jobDescription: string | null;
}): Promise<{ score: number; reason: string }> {
  const userPrompt = `Score how well this job matches the candidate.

CANDIDATE RESUME:
${args.resume.slice(0, 6000)}

${args.preferences ? `CANDIDATE PREFERENCES:\n${args.preferences}\n` : ''}

JOB POSTING:
Title: ${args.jobTitle}
Company: ${args.jobCompany ?? 'Unknown'}
Location: ${args.jobLocation ?? 'Unknown'}
Description:
${(args.jobDescription ?? '').slice(0, 4000)}

Score this match on a scale of 0-100 where:
  85-100 = excellent fit, most skills match, domain aligns perfectly
  70-84  = strong fit, many skills overlap, worth applying
  55-69  = decent fit, some relevant skills, candidate could adapt
  40-54  = weak fit, few matching skills but adjacent domain
  <40    = poor fit, completely different domain

SCORING GUIDELINES — READ CAREFULLY:

THE TESTING UMBRELLA (CRITICAL RULE):
Performance Engineering, QA, SDET, Test Automation, Quality Engineering, Software Engineer in Test, Reliability Engineering — these are NOT different domains. They are sub-specialties of the same TESTING discipline. A senior in one is qualified for the others.

If the candidate's primary experience is in any of these areas, ALL of the following job titles → score 65-80:
  - Quality Engineer / QA Engineer / QA Lead / QA Automation Engineer / QA Automation Lead
  - SDET / Software Development Engineer in Test / Software Engineer in Test
  - Test Automation Engineer / Senior Test Automation Engineer
  - Test Engineer / Senior Test Engineer / Test Analyst
  - Quality Assurance Automation Engineer
  - Reliability Engineer / Site Reliability Engineer
  - Performance Tester / Performance Test Engineer / Load Testing Engineer

DO NOT say "the candidate's expertise is primarily in performance engineering, while the job focuses on test automation" — THIS IS WRONG REASONING. They are the same domain. Score 65+.

OTHER RULES:
- The word "performance" is ambiguous. "Performance Marketer", "Investment Performance Analyst", "Asset Performance Manager" are FINANCE/MARKETING roles, NOT engineering. Score these <40.
- "Performance Test Engineer", "Performance Engineer", "Performance Tester" are the ENGINEERING meaning. Score 75-90.
- Tools are interchangeable: JMeter ≈ Gatling ≈ LoadRunner ≈ Neoload. Don't penalize tool mismatches if the discipline matches.
- A Performance/Testing engineer applying to general "Java Developer" or "Backend Engineer" → score 50-60.
- For genuinely different domains (Frontend Dev, Mobile Dev, Sales, Marketing, Product Mgmt, Data Science) → score <40.
- Location mismatch alone should NEVER drop score below 60 if skills match.
- Remote jobs get a small boost.

Respond with strict JSON: {"score": <int 0-100>, "reason": "<one or two sentences>"}`;

  const text = await chat(
    'You are a senior tech recruiter. Respond with JSON only.',
    userPrompt,
    0.2,
    true,
  );
  try {
    const parsed = JSON.parse(text);
    const score = Math.max(0, Math.min(100, Math.round(Number(parsed.score) || 0)));
    const reason = String(parsed.reason ?? '').slice(0, 500);
    return { score, reason };
  } catch {
    return { score: 0, reason: 'Failed to parse model response' };
  }
}

/**
 * Generate a tailored cover letter for a specific job.
 */
export async function generateCoverLetter(args: {
  resume: string;
  candidateName: string | null;
  jobTitle: string;
  jobCompany: string | null;
  jobDescription: string | null;
}): Promise<string> {
  const userPrompt = `Write a concise, confident cover letter (max 220 words) for this job.
Avoid clichés ("I am writing to apply..."). Lead with a hook tied to the company or role.
Reference 2-3 concrete achievements from the resume that map directly to job requirements.
End with a clear call to action. No emojis. No placeholders like [Your Name] - use the real name if provided.

CANDIDATE NAME: ${args.candidateName ?? 'the candidate'}

CANDIDATE RESUME:
${args.resume.slice(0, 6000)}

JOB:
Title: ${args.jobTitle}
Company: ${args.jobCompany ?? 'the company'}
Description:
${(args.jobDescription ?? '').slice(0, 4000)}

Output the cover letter only, no preamble.`;

  return chat(
    'You write tailored cover letters for senior tech roles.',
    userPrompt,
    0.7,
  );
}

/**
 * Extract structured insights from a resume.
 */
export async function extractResumeInsights(
  resume: string,
): Promise<ResumeInsights> {
  const userPrompt = `Read this resume and extract structured insights.

RESUME:
${resume.slice(0, 8000)}

Return strict JSON in this shape:
{
  "full_name": "<candidate's full name as it appears on the resume>",
  "email": "<primary email address from the resume, or null if not present>",
  "current_location": "<city and country, e.g. 'Noida, India', or null>",
  "phone": "<phone number with country code, or null>",
  "years_experience": <integer total years of professional experience>,
  "seniority": "junior" | "mid" | "senior" | "staff" | "principal",
  "top_skills": [<up to 12 most prominent technical skills, lowercase, deduped>],
  "suggested_roles": [<up to 6 specific job titles this candidate is well-positioned for>],
  "summary": "<1-2 sentence professional summary, 200 chars max>"
}

Rules:
- Use null for any field not clearly present in the resume. Do not guess.
- full_name: clean it up if needed but keep it as the candidate writes it.
- current_location: prefer "City, Country". If only city, return city.
- Be specific in suggested_roles (e.g. "Staff Performance Engineer" not "Engineer").
- For seniority: <2y=junior, 2-5y=mid, 5-9y=senior, 9-13y=staff, >13y=principal.
- top_skills must be concrete tools/technologies (e.g. "kubernetes", "jmeter"), not soft skills.
- summary must avoid first person ("Performance engineer with 7+ years..." not "I am a...").`;

  const text = await chat(
    'You parse resumes into structured JSON. Output JSON only.',
    userPrompt,
    0.2,
    true,
  );
  try {
    const parsed = JSON.parse(text);
    const cleanString = (v: unknown): string | undefined => {
      if (typeof v !== 'string') return undefined;
      const t = v.trim();
      if (!t || t.toLowerCase() === 'null') return undefined;
      return t;
    };
    return {
      full_name: cleanString(parsed.full_name),
      email: cleanString(parsed.email),
      current_location: cleanString(parsed.current_location),
      phone: cleanString(parsed.phone),
      years_experience:
        typeof parsed.years_experience === 'number'
          ? Math.max(0, Math.round(parsed.years_experience))
          : undefined,
      seniority: ['junior', 'mid', 'senior', 'staff', 'principal'].includes(
        parsed.seniority,
      )
        ? parsed.seniority
        : 'unknown',
      top_skills: Array.isArray(parsed.top_skills)
        ? parsed.top_skills.slice(0, 12).map(String)
        : [],
      suggested_roles: Array.isArray(parsed.suggested_roles)
        ? parsed.suggested_roles.slice(0, 6).map(String)
        : [],
      summary: typeof parsed.summary === 'string' ? parsed.summary.slice(0, 300) : '',
    };
  } catch {
    return { seniority: 'unknown', top_skills: [], suggested_roles: [] };
  }
}

/**
 * Compare a JD against a resume. Returns matched and missing skills.
 */
export async function matchSkills(args: {
  jobDescription: string;
  resumeText?: string;
  topSkills?: string[];
  candidateSkills?: string[];
}): Promise<{ matched: string[]; missing: string[] }> {
  const topSkills = args.topSkills ?? args.candidateSkills ?? [];
  const resumeText = args.resumeText ?? '';

  if (!resumeText && topSkills.length === 0) {
    return { matched: [], missing: [] };
  }

  const resumeBlock = resumeText
    ? `\nCANDIDATE RESUME:\n${resumeText.slice(0, 6000)}\n`
    : '';
  const topSkillsBlock = topSkills.length
    ? `\nCANDIDATE TOP SKILLS: ${topSkills.join(', ')}\n`
    : '';
  const jdText = args.jobDescription.slice(0, 5000);

  const userPrompt = `Compare this job description against the candidate's resume and classify requirements.

JOB DESCRIPTION:
${jdText}
${resumeBlock}${topSkillsBlock}

Extract 8-12 of the MOST IMPORTANT skills/tools the JD requires.
Then classify each as matched (present in resume) or missing (absent from resume).

Synonym rules — count as MATCHED:
- JD "load testing" + resume "performance testing" → MATCHED
- JD "Gatling" + resume "JMeter" → MATCHED (same tool category)
- JD "framework design" + resume "designed test framework" → MATCHED

Return strict JSON:
{
  "jdRequirements": ["skill1", "skill2", ...],
  "matched": ["skill1", ...],
  "missing": ["skill2", ...]
}

INVARIANTS: matched ∪ missing = jdRequirements, matched ∩ missing = ∅`;

  const text = await chat(
    'You compare candidate resumes against job descriptions. Output JSON only.',
    userPrompt,
    0.1,
    true,
  );

  let parsed: { jdRequirements?: unknown; matched?: unknown; missing?: unknown } = {};
  try {
    parsed = JSON.parse(text);
  } catch {
    return { matched: [], missing: [] };
  }

  const cleanList = (v: unknown): string[] =>
    Array.isArray(v)
      ? v.map(String).map(s => s.trim()).filter(s => s.length >= 2 && s.length <= 80)
      : [];

  const jdRequirements = cleanList(parsed.jdRequirements);
  const jdLower = jdRequirements.map(r => r.toLowerCase());
  const isFromJd = (item: string) => {
    const l = item.toLowerCase();
    return jdLower.some(r => r === l || r.includes(l) || l.includes(r));
  };

  let matched = cleanList(parsed.matched).filter(isFromJd);
  let missing = cleanList(parsed.missing).filter(isFromJd);
  const matchedKeys = new Set(matched.map(m => m.toLowerCase()));
  missing = missing.filter(m => !matchedKeys.has(m.toLowerCase()));

  const dedupe = (arr: string[]) => [...new Map(arr.map(s => [s.toLowerCase(), s])).values()];
  return { matched: dedupe(matched).slice(0, 15), missing: dedupe(missing).slice(0, 8) };
}

/**
 * Generate an ATS-optimised plain-text resume tailored to a specific job.
 * Preserves the candidate's exact structure. Weaves in missing keywords.
 */
export async function generateAtsResume(args: {
  resumeText: string;
  jobTitle: string;
  jobCompany: string | null;
  jobDescription: string;
  candidateName: string | null;
  email: string;
  phone?: string | null;
  location?: string | null;
  selectedKeywords?: string[];
}): Promise<{ resume: string; added: string[]; alreadyHad: string[] }> {
  const { selectedKeywords = [] } = args;

  // --- ATS keyword enrichment list (researched for performance engineering JDs) ---
  const atsBoostKeywords = [
    'k6', 'Gatling', 'Grafana', 'Prometheus', 'Azure DevOps', 'Python',
    'Docker', 'Kubernetes', 'OpenTelemetry', 'NFR', 'SLA', 'SLO', 'SLI',
    'Shift-Left Testing', 'Cloud Performance Testing', 'WebSocket',
    'Distributed Load Testing', 'Capacity Planning', 'Workload Modeling',
    'Performance Benchmarking', 'Throughput', 'Latency', 'Percentile',
    'Thread Dump Analysis', 'Heap Dump Analysis', 'GC Tuning',
  ];

  const allKeywordsToWeave = [...new Set([...atsBoostKeywords, ...selectedKeywords])];

  const keywordInstructions = allKeywordsToWeave.length > 0
    ? `\n\nKEYWORDS TO WEAVE IN (add these naturally where truthful — if genuinely unfamiliar, add to Skills section only):\n${allKeywordsToWeave.map(k => `  - ${k}`).join('\n')}\n`
    : '';

  const prompt = `You are an expert ATS resume writer. Reformat and enrich this candidate's resume.

CRITICAL RULES — READ BEFORE ANYTHING ELSE:
1. PRESERVE the EXACT structure: same sections in same order, same jobs, same companies, same dates, same bullets. Do NOT restructure.
2. Do NOT remove any content. Every bullet, every job, every achievement, every skill stays.
3. The ONLY changes allowed:
   a. Convert tables → plain text (ATS cannot parse tables)
   b. Weave the KEYWORDS listed below naturally into existing bullet points OR add them to the Skills section
   c. Rewrite the Professional Summary to lead with the AI angle (see example below)
   d. Ensure ALL CAPS section headers, "- " bullet prefix format
4. For the new Achievement about JMeter Performance Center — add it to KEY ACHIEVEMENTS section:
   "- Architected and deployed a free, open-source Performance Center equivalent for JMeter (React/TypeScript frontend, Python backend) — a full web-based UI platform enabling teams to upload JMX scenarios, configure load test parameters, and execute distributed load tests from a centralized interface. Adopted by multiple teams at Charles Schwab, eliminating dependency on expensive LoadRunner Enterprise/Performance Center licensing."
5. The output MUST be at least as long as the input. Do NOT shorten.

SUMMARY REWRITE EXAMPLE (lead with AI angle):
"Senior Performance Engineer with 7.7 years of experience building AI-powered automation agents for enterprise performance testing. Delivered a 94% reduction in test execution time through Agentic AI workflows. Proven expertise in LoadRunner, JMeter, BlazeMeter across BFSI, Healthcare, Retail, and Media domains..."
${keywordInstructions}
FORMATTING:
- Section headers: ALL CAPS (e.g. PROFESSIONAL SUMMARY, KEY ACHIEVEMENTS, TECHNICAL SKILLS)
- Bullets: "- " prefix
- Job headers: "Job Title  |  Company, City  |  Month YYYY – Month YYYY"
- Client line below job header: "Client: ClientName (Domain)"
- Skills: "Category: Tool1, Tool2, Tool3" (one category per line, no table)
- No graphics, no columns, no special characters

CANDIDATE CONTACT:
${args.candidateName ?? 'SHASHANK SINGH'}
${args.email}
${args.phone ?? '+91 8077162893'}
${args.location ?? 'Noida, India'}
linkedin.com/in/shashank-singh-610155b1

CANDIDATE'S CURRENT RESUME (preserve ALL of this — output everything):
${args.resumeText.slice(0, 14000)}

TARGET JOB (for keyword relevance only — do NOT add skills from here unless in the keyword list):
Title: ${args.jobTitle}
Company: ${args.jobCompany ?? 'Not specified'}
Description (first 3000 chars):
${args.jobDescription.slice(0, 3000)}

Output the COMPLETE reformatted resume. No preamble. Just the resume text.`;

  const resume = await chat(
    'You reformat resumes into ATS-friendly plain text. Preserve all content. Output ONLY the resume.',
    prompt,
    0.3,
  );

  // Track what was added vs already present
  const originalLower = args.resumeText.toLowerCase();
  const added: string[] = [];
  const alreadyHad: string[] = [];

  for (const kw of allKeywordsToWeave) {
    const inOriginal = originalLower.includes(kw.toLowerCase());
    const inGenerated = resume.toLowerCase().includes(kw.toLowerCase());
    if (inGenerated && !inOriginal) added.push(kw);
    else if (inGenerated && inOriginal) alreadyHad.push(kw);
  }

  return { resume, added, alreadyHad };
}
