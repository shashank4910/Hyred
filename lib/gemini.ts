/**
 * AI helpers — OpenAI (gpt-4o-mini) as primary, Gemini 2.0 Flash as fallback.
 *
 * All chat-based calls try OpenAI first (if OPENAI_API_KEY is set) and fall
 * back to Gemini on failure or missing key.
 * Embeddings remain Gemini text-embedding-004 (768 dims) since the DB schema
 * is configured for those dimensions.
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import OpenAI from 'openai';
import type { ResumeInsights } from './types';

const CHAT_MODEL = 'gemini-2.0-flash';
const EMBED_MODEL = 'text-embedding-004';

function getClient(): GoogleGenerativeAI {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('Missing GEMINI_API_KEY env var');
  return new GoogleGenerativeAI(key);
}

function getOpenAIClient(): OpenAI | null {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  return new OpenAI({ apiKey: key });
}

async function chat(
  systemPrompt: string,
  userPrompt: string,
  temperature = 0.3,
  jsonMode = false,
): Promise<string> {
  // Try OpenAI first (more reliable, already paid)
  const openaiClient = getOpenAIClient();
  if (openaiClient) {
    try {
      const res = await openaiClient.chat.completions.create({
        model: 'gpt-4o-mini',
        temperature,
        ...(jsonMode ? { response_format: { type: 'json_object' as const } } : {}),
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
      });
      return (res.choices[0]?.message?.content ?? '').trim();
    } catch (e) {
      console.warn('OpenAI failed, falling back to Gemini:', (e as Error).message);
    }
  }

  // Fallback to Gemini
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
 * Extract ATS-relevant keywords from a specific job description using the LLM.
 * Used as Pass 1 of the two-pass ATS resume generation: we first identify
 * what THIS specific JD is asking for, then we tailor the resume around those
 * keywords. This is what makes the resume genuinely "tailored per JD" rather
 * than "padded with a static perf-eng keyword list".
 */
export async function extractJdKeywords(args: {
  jobTitle: string;
  jobDescription: string;
}): Promise<string[]> {
  if (!args.jobDescription || args.jobDescription.length < 50) return [];

  const userPrompt = `Extract the ATS-relevant keywords from this job description.

ATS keywords are the specific tools, technologies, frameworks, methodologies,
certifications, and named processes an automated resume scanner would search
for. Skip vague soft-skill phrases ("strong communicator", "team player",
"self-starter").

JOB TITLE: ${args.jobTitle}

JOB DESCRIPTION:
${args.jobDescription.slice(0, 7000)}

RULES:
- Use the EXACT phrasing from the JD whenever possible (e.g., if the JD says
  "JMeter" return "JMeter", not "Apache JMeter"; if it says "load testing"
  return "load testing", not "performance testing").
- Include tool/framework names: JMeter, Kubernetes, Splunk, Dynatrace, etc.
- Include methodologies: Shift-Left Testing, TDD, Agile, etc.
- Include certifications when explicitly mentioned: PMP, AWS Certified, etc.
- Include named domain abbreviations: NFR, SLA, SLO, BFSI, etc.
- Each keyword: 1-3 words max.
- Order by importance: most-mentioned + must-have requirements first.
- Skip generic words: "communication", "leadership", "passion", "ownership".
- Aim for 18-25 keywords. Fewer is fine if the JD is short.

Return strict JSON: {"keywords": ["keyword1", "keyword2", ...]}`;

  const text = await chat(
    'You extract ATS keywords from job descriptions. Output JSON only.',
    userPrompt,
    0.1,
    true,
  );

  try {
    const parsed = JSON.parse(text);
    const list: unknown[] = Array.isArray(parsed.keywords) ? parsed.keywords : [];
    const cleaned: string[] = list
      .map((v) => String(v).trim())
      .filter((s) => s.length >= 2 && s.length <= 60);
    return [...new Set(cleaned)].slice(0, 25);
  } catch {
    return [];
  }
}

/**
 * Replace common non-ASCII characters with ASCII equivalents. Older ATS
 * parsers (Taleo, iCIMS) sometimes choke on smart quotes, em-dashes, and
 * unicode bullets. Defense-in-depth on top of the prompt's "ASCII only" rule.
 */
function normalizeAscii(s: string): string {
  return s
    .replace(/[\u2014\u2013]/g, '-')          // em-dash, en-dash
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'") // smart single quotes
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"') // smart double quotes
    .replace(/[\u2022\u25CF\u25E6\u2043\u00B7]/g, '-') // bullet variants
    .replace(/\u00A0/g, ' ')                  // non-breaking space
    .replace(/\u2026/g, '...')                // ellipsis
    .replace(/[\u200B-\u200D\uFEFF]/g, '');   // zero-width chars
}

/**
 * Generate an ATS-optimised plain-text resume tailored to a specific job.
 *
 * Two-pass design:
 *   1. extractJdKeywords() reads the JD and returns the keywords that matter
 *      for THIS job (not a static list).
 *   2. The resume prompt is built around those JD keywords, with conditional
 *      directives (AI summary only if JD mentions AI; JMeter Performance
 *      Center bullet only for performance/test/QA roles).
 *
 * Returns an honest ATS Match Score (% of JD keywords actually present in
 * the generated resume) so the user can see whether to regenerate.
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
  jdKeywords?: string[]; // optional: caller can supply pre-extracted keywords
}): Promise<{
  resume: string;
  ats_match_score: number;
  jd_keywords: string[];
  added: string[];
  alreadyHad: string[];
  missing: string[];
}> {
  const { selectedKeywords = [] } = args;

  // ── Pass 1: extract JD-specific keywords (unless caller already did) ────────
  const jdKeywords = args.jdKeywords?.length
    ? args.jdKeywords
    : await extractJdKeywords({
        jobTitle: args.jobTitle,
        jobDescription: args.jobDescription,
      });

  // Combine JD keywords with anything the user manually ticked in the picker.
  // JD keywords come first because they're what the ATS will actually score on.
  const allKeywords = [...new Set([...jdKeywords, ...selectedKeywords])];

  // ── Conditional directives based on JD content ──────────────────────────────
  const jdLower = args.jobDescription.toLowerCase();
  const titleLower = args.jobTitle.toLowerCase();

  const isAiRole =
    /\b(ai|artificial intelligence|ml|machine learning|llm|gpt|agentic|automation agent|copilot|generative ai|prompt engineer)\b/.test(jdLower) ||
    /\b(ai|ml|llm|agentic|generative ai)\b/.test(titleLower);

  const isPerfOrTestRole =
    /\b(perf|performance|sdet|qa\b|quality engineer|test automat|reliability eng|sre|load test|stress test)\b/.test(jdLower) ||
    /\b(perf|performance|sdet|qa|quality|test|sre|tester)\b/.test(titleLower);

  const summaryDirective = isAiRole
    ? 'This JD mentions AI/ML/automation, so it is appropriate to highlight the candidate\'s AI agent work in the Professional Summary. Lead with the strongest technical specialization that the JD asks for, then bring in the AI/automation angle as supporting evidence.'
    : 'Lead the Professional Summary with the candidate\'s core technical specialization that maps directly to this JD (e.g. "Senior Performance Engineer with 7.7 years..."). Do NOT lead with AI/automation unless the JD explicitly asks for AI/ML/agentic work.';

  const jmeterAchievementClause = isPerfOrTestRole
    ? `e. INCLUDE this real achievement in KEY ACHIEVEMENTS (or create that section right after PROFESSIONAL SUMMARY if it does not exist):
   "- Architected and deployed a free, open-source Performance Center equivalent for JMeter (React/TypeScript frontend, Python backend) - a full web-based UI platform enabling teams to upload JMX scenarios, configure load test parameters, and execute distributed load tests from a centralized interface. Adopted by multiple teams at Charles Schwab, eliminating dependency on expensive LoadRunner Enterprise/Performance Center licensing."`
    : '';

  const keywordsBlock = allKeywords.length > 0
    ? `

TARGET JD KEYWORDS (extracted from THIS specific JD - incorporate them where truthful):
${allKeywords.map(k => `  - ${k}`).join('\n')}

KEYWORD RULES:
- Where the candidate has equivalent real experience, use the EXACT phrasing from this list (e.g. write "JMeter" not "Apache JMeter performance tool"; if the JD says "load testing", use that phrase even if the candidate normally writes "performance testing").
- For TECHNICAL SKILLS: reorder entries so JD-priority tools appear FIRST in their category line.
- For tools the candidate has never used, list them ONLY in TECHNICAL SKILLS (do NOT invent fake bullets in Experience).
- Do NOT fabricate experience. Truthfulness is the highest priority - even higher than keyword density.
`
    : '';

  const prompt = `You are an expert ATS resume writer. Tailor this resume to pass the ATS scanner for the target job below.

PRIMARY GOAL: maximize the overlap between the resume's vocabulary and the TARGET JD KEYWORDS, without fabricating any experience.

CRITICAL RULES:
1. PRESERVE every real fact: same companies, same dates, same roles, same achievements. Never invent jobs, dates, or numbers.
2. Keep all sections from the input resume. You MAY reorder entries inside TECHNICAL SKILLS to surface JD-priority tools first.
3. Output must be plain ASCII. No em-dashes, no smart quotes, no unicode bullets, no emojis, no graphics, no tables, no columns.
4. Allowed transformations:
   a. Convert any tables to "Category: Tool1, Tool2, Tool3" plain-text lines.
   b. Weave TARGET JD KEYWORDS naturally into existing bullets where the candidate truthfully has that experience.
   c. Rewrite the Professional Summary per the directive below.
   d. Reorder Skills entries inside TECHNICAL SKILLS to put JD-priority tools first.${jmeterAchievementClause ? '\n   ' + jmeterAchievementClause : ''}

PROFESSIONAL SUMMARY DIRECTIVE:
${summaryDirective}

FORMAT (these patterns are what ATS parsers expect):
- Section headers: ALL CAPS, alone on a line. Use exactly these names where applicable: PROFESSIONAL SUMMARY, KEY ACHIEVEMENTS, TECHNICAL SKILLS, CERTIFICATIONS, PROFESSIONAL EXPERIENCE, EDUCATION.
- Every bullet starts with "- " (hyphen + space). Never use "*" or any unicode bullet symbol.
- Job header: "Job Title  |  Company, City  |  Month YYYY - Month YYYY" (straight hyphen between dates).
- Optional client subline directly under job header: "Client: ClientName (Domain)".
- Skills lines: "Category: Tool1, Tool2, Tool3" - one category per line, no tables.
- One blank line between sections. No blank line between job header and its bullets.
${keywordsBlock}
CANDIDATE CONTACT BLOCK (place at the very top, one item per line, in this exact order):
${args.candidateName ?? 'SHASHANK SINGH'}
${args.email}
${args.phone ?? '+91 8077162893'}
${args.location ?? 'Noida, India'}
linkedin.com/in/shashank-singh-610155b1

CANDIDATE'S CURRENT RESUME (this is the only source of truth - never add experience that is not here):
${args.resumeText.slice(0, 14000)}

TARGET JOB:
Title: ${args.jobTitle}
Company: ${args.jobCompany ?? 'Not specified'}
Description:
${args.jobDescription.slice(0, 5000)}

Output the complete tailored resume in plain ASCII text. No preamble, no explanation, no markdown fences. Start with the candidate's name on the first line.`;

  const raw = await chat(
    'You reformat resumes into ATS-friendly plain ASCII text. Preserve all real content. Never fabricate experience. Output ONLY the resume.',
    prompt,
    0.25,
  );

  // Defense-in-depth ASCII normalization in case the model slipped a unicode char in.
  const resume = normalizeAscii(raw);

  // ── ATS Match Score: % of JD keywords actually present in the resume ────────
  const resumeLower = resume.toLowerCase();
  const originalLower = args.resumeText.toLowerCase();

  const added: string[] = [];
  const alreadyHad: string[] = [];
  const missing: string[] = [];

  for (const kw of jdKeywords) {
    const inResume = resumeLower.includes(kw.toLowerCase());
    const inOriginal = originalLower.includes(kw.toLowerCase());
    if (inResume) {
      if (inOriginal) alreadyHad.push(kw);
      else added.push(kw);
    } else {
      missing.push(kw);
    }
  }

  const present = added.length + alreadyHad.length;
  const ats_match_score = jdKeywords.length > 0
    ? Math.round((present / jdKeywords.length) * 100)
    : 0;

  return {
    resume,
    ats_match_score,
    jd_keywords: jdKeywords,
    added,
    alreadyHad,
    missing,
  };
}
