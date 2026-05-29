/**
 * AI helpers — OpenAI as primary for chat AND embeddings, Gemini 2.0 Flash as
 * chat fallback only.
 *
 * Chat-based calls (scoreJob, matchSkills, generateAtsResume, etc.) try OpenAI
 * first (if OPENAI_API_KEY is set) and fall back to Gemini on failure.
 * Embeddings are OpenAI text-embedding-3-small (1536 dims). Gemini's
 * text-embedding-004 was deprecated by Google on 2026-01-14 and the v1beta
 * endpoint returns 404; switching to OpenAI also unblocks the cron when the
 * Gemini free-tier quota is exhausted.
 *
 * NOTE: existing rows have 768-dim vectors stored as JSONB. Cosine similarity
 * returns 0 on length mismatch, so old vectors are silently ignored — no
 * schema migration needed. Run scripts/clear-embeddings.sql once to wipe
 * stale vectors and the next ingest re-embeds at 1536 dims.
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import OpenAI from 'openai';
import type { ResumeInsights } from './types';

const CHAT_MODEL = 'gemini-2.0-flash';
const EMBED_MODEL = 'text-embedding-3-small';

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
 * Embed a piece of text using OpenAI text-embedding-3-small (1536 dims).
 * Throws if OPENAI_API_KEY is not set — there is no Gemini fallback for
 * embeddings (text-embedding-004 was deprecated and gemini-embedding-001 is
 * paid + needs a different SDK).
 */
export async function embed(text: string): Promise<number[]> {
  const client = getOpenAIClient();
  if (!client) throw new Error('Missing OPENAI_API_KEY env var');
  const trimmed = text.slice(0, 8000);
  const result = await client.embeddings.create({
    model: EMBED_MODEL,
    input: trimmed,
  });
  const vector = result.data[0]?.embedding;
  if (!vector) throw new Error('OpenAI embeddings response had no vector');
  return vector;
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
}): Promise<{ score: number; reason: string; matchedSkills: string[]; missingSkills: string[] }> {
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

Respond with strict JSON:
{
  "score": <int 0-100>,
  "reason": "<one or two sentences>",
  "matchedSkills": [<up to 5 SHORT skill/tool/domain keywords that appear in BOTH the JD and the resume — e.g. "JMeter", "Load Testing", "Java". These are WHY it matched.>],
  "missingSkills": [<up to 5 SHORT skill/tool keywords the JD asks for that are NOT clearly in the resume — e.g. "Kubernetes", "Gatling". These are the GAPS. Empty array if none.>]
}

matchedSkills/missingSkills RULES:
- Keep each entry 1-3 words max. Real tools/skills/domains only, no sentences.
- matchedSkills: only include terms genuinely present in BOTH JD and resume.
- missingSkills: only terms the JD explicitly wants that the resume lacks.
- If the JD is too short to tell, return best-effort based on the title.`;

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
    const cleanSkills = (arr: unknown): string[] =>
      Array.isArray(arr)
        ? arr
            .map((s) => String(s).trim())
            .filter((s) => s.length > 0 && s.length <= 40)
            .slice(0, 5)
        : [];
    return {
      score,
      reason,
      matchedSkills: cleanSkills(parsed.matchedSkills),
      missingSkills: cleanSkills(parsed.missingSkills),
    };
  } catch {
    return { score: 0, reason: 'Failed to parse model response', matchedSkills: [], missingSkills: [] };
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
  "years_experience": <number total years of professional experience, decimal allowed (e.g. 7.7 if resume says 7.7 years)>,
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
          ? Math.max(0, Math.round(parsed.years_experience * 10) / 10) // preserve one decimal (e.g. 7.7) instead of rounding to integer
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
 * Clean a job-listing title down to a recruiter-presentable role title.
 * The JD's listing title is full of noise that should never reach the
 * candidate's resume - department codes (CX, RX), version numbers (II, III),
 * year ranges, location pipes, hiring tail words, parenthetical departments,
 * dash-separated designations ("- Assistant Manager"), and slash-separated
 * specializations ("/ Backend").
 * If the parenthetical contents look like a real role (engineer / tester /
 * developer / etc.), prefer the parenthetical because it's usually the
 * better-formed title (e.g. "Tester II, Product (Performance Tester)" =>
 * "Performance Tester").
 *
 * Examples:
 *   "Specialist Performance Engineer, CX"                       -> "Specialist Performance Engineer"
 *   "Tester II, Product (Performance Tester)"                   -> "Performance Tester"
 *   "Senior Performance Testing Engineer - Assistant Manager"   -> "Senior Performance Testing Engineer"
 *   "Performance Engineer / Backend"                            -> "Performance Engineer"
 *   "Sr Performance Engineer - 5-8 yrs - Pune"                  -> "Sr Performance Engineer"
 *   "Performance Tester | Bangalore | Hybrid"                   -> "Performance Tester"
 *   "Senior SDET (BFSI)"                                        -> "Senior SDET"
 *   "QA Engineer III"                                           -> "QA Engineer"
 *   ""                                                          -> "Senior Performance Engineer" (fallback)
 */
function cleanJdTitle(raw: string): string {
  const ROLE_RE = /\b(engineer|engineering|tester|testing|developer|development|analyst|architect|consultant|specialist|sdet|sre|administrator|coordinator|lead|manager|designer|technician|scientist|programmer)\b/i;
  // Domain / specialization words. A title side that has one of these names
  // the ACTUAL role (e.g. "Performance Engineering"), and should win over a
  // bare seniority phrase like "Senior Lead" that only has a generic role word.
  const DOMAIN_RE = /\b(performance|load|stress|qa|quality|automation|sdet|test|testing|reliability|sre|backend|frontend|fullstack|full-stack|devops|data|ml|ai|security|cloud|platform|infrastructure|mobile|android|ios|web|api|database|network|systems?|embedded|firmware|analytics)\b/i;
  let t = (raw ?? '').trim();

  // 0. Normalise hyphen separators that have a space on AT LEAST one side
  //    into a canonical " - ". This catches "Senior Lead- Performance" (space
  //    only after the dash) which the old code missed. Hyphenated compound
  //    words like "full-stack" / "front-end" / "e-commerce" have NO adjacent
  //    spaces, so they are left intact.
  t = t.replace(/\s+-\s*/g, ' - ').replace(/\s*-\s+/g, ' - ');

  // 1. If there's a parenthetical that looks like a real role, prefer IT.
  //    Otherwise just strip parentheticals (they're usually department/skill
  //    annotations like "(BFSI)", "(WFH)", "(Pune)").
  const parenMatch = t.match(/\(([^)]+)\)/);
  if (parenMatch && ROLE_RE.test(parenMatch[1])) {
    t = parenMatch[1].trim();
  } else {
    t = t.replace(/\s*\([^)]*\)\s*/g, ' ').trim();
  }

  // 2. Strip everything after the first comma (department/location).
  t = t.split(',')[0].trim();

  // 2.5. Resolve " - " / " / " separators by picking the side that names the
  //      ACTUAL role. Old bug: "Senior Lead - Performance Engineering" became
  //      "Senior Lead" because "lead" is a role word — losing the real
  //      specialization. Now we prefer the side that has a DOMAIN word.
  //        "Senior Lead - Performance Engineering"          -> "Performance Engineering"
  //        "Senior Performance Testing Engineer - Asst Mgr" -> "Senior Performance Testing Engineer"
  //        "QA Engineer / Backend"                          -> "QA Engineer"
  //        "Performance Tester - Banking"                   -> "Performance Tester"
  for (const sep of [' - ', ' / ']) {
    const idx = t.indexOf(sep);
    if (idx > 0) {
      const before = t.slice(0, idx).trim();
      const after = t.slice(idx + sep.length).trim();
      const beforeRole = ROLE_RE.test(before);
      const afterRole = ROLE_RE.test(after);
      const beforeDomain = DOMAIN_RE.test(before);
      const afterDomain = DOMAIN_RE.test(after);
      // The after-side names a specialization the before-side lacks -> take it.
      if (afterRole && afterDomain && !beforeDomain) {
        t = after;
        break;
      }
      // Otherwise the before-side is the role (it has a domain, or the after
      // side is just a designation/department with no specialization).
      if (beforeRole && (beforeDomain || !afterDomain)) {
        t = before;
        break;
      }
      // Fallback: whichever side has a role word.
      if (afterRole) {
        t = after;
        break;
      }
    }
  }

  // 3. Strip year ranges ("- 4 to 8 years", "- 5-8 yrs"). Largely redundant
  //    after step 2.5 but kept as a safety net for "Engineer- 5 yrs" without
  //    the surrounding spaces that step 2.5 requires.
  t = t.replace(/\s*-\s*\d.*$/i, '').trim();

  // 4. Strip pipe-separated trail (location, work mode).
  t = t.replace(/\s*\|\s*.*$/, '').trim();

  // 5. Strip "at Company X".
  t = t.replace(/\s+at\s+.*$/i, '').trim();

  // 6. Strip hiring/work-mode tail keywords.
  t = t.replace(
    /\s*\b(opening|openings|jobs?|hiring|wfh|remote|fulltime|full-time|contract|permanent|onsite|hybrid|immediate joiner|notice period)\b.*$/i,
    '',
  ).trim();

  // 7. Strip trailing Roman numerals (II, III, IV ...).
  t = t.replace(/\s+(I{1,3}|IV|V|VI|VII|VIII|IX|X)$/g, '').trim();

  // 8. Strip a trailing 1-3 letter ALL-CAPS dept code (CX, RX, EU, US, APAC,
  //    etc.) as long as it's NOT the only word and the title still has at
  //    least one role-like keyword left after stripping. Without that guard
  //    we'd murder titles like "AI Engineer" -> "Engineer".
  const words = t.split(/\s+/);
  if (words.length > 1) {
    const last = words[words.length - 1];
    if (/^[A-Z]{1,3}$/.test(last)) {
      const candidate = words.slice(0, -1).join(' ').trim();
      if (ROLE_RE.test(candidate)) t = candidate;
    }
  }

  // 9. Strip stray dept descriptor tail words that often follow a comma we
  //    already stripped (defensive, in case the title used " - " instead of
  //    a comma to attach the dept). GUARDED: only strip when a role keyword
  //    still remains afterwards, so "Performance Engineering" keeps its
  //    "Engineering" (stripping it would leave a bare "Performance").
  {
    const stripped = t
      .replace(/\s+(product|platform|engineering|operations|infrastructure|technology|technologies)\b\s*$/i, '')
      .trim();
    if (stripped !== t && ROLE_RE.test(stripped)) t = stripped;
  }

  // 9.5. Strip a trailing requisition-ID-like token (contains 3+ digits),
  //      e.g. "QA Performance Tester IRC294922" -> "QA Performance Tester",
  //      "Performance Engineer REQ-12345" -> "Performance Engineer". Guarded:
  //      only strip when a role keyword still remains.
  {
    const stripped = t.replace(/\s+[A-Za-z]*\d{3,}[A-Za-z0-9-]*$/i, '').trim();
    if (stripped !== t && ROLE_RE.test(stripped)) t = stripped;
  }

  // 10. Final tidy.
  t = t.replace(/[,;:\-]\s*$/, '').trim();

  // 11. Sanity check. Fallback if the result is too short, too long, or has
  //     no recognizable role word.
  const fallback = 'Senior Performance Engineer';
  if (t.length < 4 || t.length > 70) return fallback;
  if (t.split(/\s+/).length > 8) return fallback;
  if (!ROLE_RE.test(t)) return fallback;
  return t;
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
  excludedKeywords?: string[]; // user-specified keywords that MUST NOT appear
  jdKeywords?: string[]; // optional: caller can supply pre-extracted keywords
}): Promise<{
  resume: string;
  ats_match_score: number;
  jd_keywords: string[];
  added: string[];
  alreadyHad: string[];
  missing: string[];
}> {
  const { selectedKeywords = [], excludedKeywords = [] } = args;

  // ── Pass 1: extract JD-specific keywords (unless caller already did) ────────
  const jdKeywords = args.jdKeywords?.length
    ? args.jdKeywords
    : await extractJdKeywords({
        jobTitle: args.jobTitle,
        jobDescription: args.jobDescription,
      });

  // Combine JD keywords with anything the user manually ticked in the picker.
  // JD keywords come first because they're what the ATS will actually score on.
  // selectedKeywords are tracked separately so we can give them stronger
  // emphasis in the prompt - "MUST appear" rather than "should weave in".
  // excludedKeywords are the user's "remove these" list - they are filtered
  // out of allKeywords so they're never recommended, AND they're called out
  // explicitly in the prompt so any pre-existing mention in the candidate's
  // current resume is also stripped on regeneration.
  const selectedSet = new Set(selectedKeywords.map(s => s.toLowerCase()));
  const excludedSet = new Set(excludedKeywords.map(s => s.toLowerCase()));
  const allKeywords = [...new Set([...jdKeywords, ...selectedKeywords])]
    .filter(k => !excludedSet.has(k.toLowerCase()));

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

  // Achievement bullet for the JMeter Performance Center work. Genericised so
  // the client name (e.g. "Charles Schwab") never appears in this bullet -
  // client identity is confidential and must only appear in the "Client:" line
  // under the relevant job in PROFESSIONAL EXPERIENCE.
  const jmeterAchievementClause = isPerfOrTestRole
    ? `e. INCLUDE this real achievement in KEY ACHIEVEMENTS (or create that section right after PROFESSIONAL SUMMARY if it does not exist):
   "- Architected and deployed a free, open-source Performance Center equivalent for JMeter (React/TypeScript frontend, Python backend) - a full web-based UI platform enabling teams to upload JMX scenarios, configure load test parameters, and execute distributed load tests from a centralized interface. Adopted by multiple teams across the organization, eliminating dependency on expensive LoadRunner Enterprise/Performance Center licensing."`
    : '';

  // ── Role title alignment with JD ────────────────────────────────────────────
  // ATS systems weight the candidate's most recent role title heavily in
  // matching. We clean the JD's listing title aggressively so noise like
  // department codes (CX, RX), version numbers (II, III), parenthetical
  // role hints, and trailing "openings/WFH/Pune" phrases never reach the
  // candidate's resume - that noise is a recruiter red flag ("did the AI
  // just paste the JD listing into the resume?").
  const targetCurrentRoleTitle = cleanJdTitle(args.jobTitle ?? '');

  const keywordsBlock = allKeywords.length > 0
    ? `

TARGET JD KEYWORDS (extracted from THIS specific JD - incorporate them where truthful):
${allKeywords.map(k => {
  const isPriority = selectedSet.has(k.toLowerCase());
  return `  - ${k}${isPriority ? '   [USER PRIORITY - this keyword MUST appear in the final resume, at minimum in TECHNICAL SKILLS]' : ''}`;
}).join('\n')}

KEYWORD RULES:
- Where the candidate has equivalent real experience, use the EXACT phrasing from this list (e.g. write "JMeter" not "Apache JMeter performance tool"; if the JD says "load testing", use that phrase even if the candidate normally writes "performance testing").
- For TECHNICAL SKILLS: reorder entries so JD-priority tools appear FIRST in their category line.
- For tools the candidate has never used, list them ONLY in TECHNICAL SKILLS (do NOT invent fake bullets in Experience).
- Items marked [USER PRIORITY] MUST appear at least once in the final resume - the user has explicitly flagged these as critical for the ATS scan. If the candidate has no experience with a USER PRIORITY tool, list it under the most appropriate category in TECHNICAL SKILLS (e.g. "Monitoring: Splunk, Dynatrace, Grafana, Prometheus") - this is acceptable because TECHNICAL SKILLS is by convention a list of familiarity, not deep experience.
- Do NOT fabricate experience. Truthfulness is the highest priority - even higher than keyword density.

STRICT KEYWORD SCOPE (this is critical - the user explicitly asked for it):
- The ONLY new tools / technologies / frameworks / methodologies / certifications / named processes you may introduce into the resume are those listed under TARGET JD KEYWORDS above.
- Do NOT pick up vocabulary directly from the TARGET JOB description text. The JD is provided for relevance context only - to help you decide which of the candidate's existing experience to emphasize. It is NOT a source of new keywords.
- Tools / skills already present in the candidate's CURRENT RESUME may stay even if they are not in TARGET JD KEYWORDS - those are the candidate's real, existing experience.
- If you are tempted to add a tool name not in TARGET JD KEYWORDS and not in the candidate's current resume, do NOT add it.
${excludedKeywords.length > 0 ? `
EXCLUDED KEYWORDS (the user explicitly does NOT want these in the resume):
${excludedKeywords.map(k => `  - ${k}`).join('\n')}
- These keywords MUST NOT appear ANYWHERE in the final resume - not in PROFESSIONAL SUMMARY, not in KEY ACHIEVEMENTS, not in TECHNICAL SKILLS, not in any bullet, not even inside other words.
- If any of these keywords are currently in the candidate's CURRENT RESUME (for example because they were added in a previous generation that the user now wants undone), REMOVE every occurrence and rephrase the surrounding sentence so the resume still reads naturally.
- Exclusion takes precedence over everything: even if an excluded keyword appears in TARGET JD KEYWORDS, it stays out. The user's explicit "remove" decision overrides the JD priority.
` : ''}`
    : '';

  const prompt = `You are an expert ATS resume writer. Tailor this resume to pass the ATS scanner for the target job below.

PRIMARY GOAL: maximize the overlap between the resume's vocabulary and the TARGET JD KEYWORDS, without fabricating any experience.

CRITICAL RULES:
1. PRESERVE every real fact: same companies, same dates, same achievements. Never invent jobs, dates, or numbers. (Note: the CURRENT/most-recent role TITLE is governed by the ROLE TITLE ALIGNMENT directive below - past role titles stay as-is.)
2. Keep all sections from the input resume. You MAY reorder entries inside TECHNICAL SKILLS to surface JD-priority tools first.
3. Output must be plain ASCII. No em-dashes, no smart quotes, no unicode bullets, no emojis, no graphics, no tables, no columns.
4. CLIENT NAME PRIVACY: any client / end-customer name (for example "Charles Schwab" or any other client the candidate has worked for) must appear ONLY in the "Client: ClientName (Domain)" subline directly under the relevant job header in PROFESSIONAL EXPERIENCE - that is the only allowed location. Do NOT mention the client name anywhere else: not in PROFESSIONAL SUMMARY, not in KEY ACHIEVEMENTS, not in any bullet, not in skills. Replace any such mention with neutral phrasing like "the organization", "a major BFSI client", or simply omit it.
5. Allowed transformations:
   a. Convert any tables to "Category: Tool1, Tool2, Tool3" plain-text lines.
   b. Weave TARGET JD KEYWORDS naturally into existing bullets where the candidate truthfully has that experience.
   c. Rewrite the Professional Summary per the directive below.
   d. Reorder Skills entries inside TECHNICAL SKILLS to put JD-priority tools first.
   e. Apply ROLE TITLE ALIGNMENT (below) to the candidate's CURRENT/most-recent role only.${jmeterAchievementClause ? '\n   ' + jmeterAchievementClause.replace(/^e\. /, 'f. ') : ''}

ROLE TITLE ALIGNMENT (important for ATS scoring - the candidate explicitly asked for this):
- Set the candidate's CURRENT (most recent) role title in PROFESSIONAL EXPERIENCE to: ${targetCurrentRoleTitle}
- The title above has ALREADY been cleaned of department codes (CX, RX), version numbers (II, III), parenthetical noise, year ranges, location/hiring tails, and dash-separated designations (e.g. "- Assistant Manager", "- Senior Manager", "- Vice President", "/ Backend"). Use it EXACTLY AS GIVEN. Do NOT append anything from the original JD posting like ", CX", ", Product", "II", "WFH", "- Assistant Manager", or any parenthetical - those would tip off a recruiter that the title was machine-pasted from a job listing.
- This replaces whatever current-role title is in the candidate's input resume. The candidate's actual responsibilities are unchanged - only the title label is aligned with the JD's wording so the ATS title-match component scores higher.
- Past roles (every role except the most recent one) MUST keep their original titles from the input resume. Do not change historical titles.
- Use the exact same cleaned title as a tagline on line 2 of the contact block (described below).

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
${targetCurrentRoleTitle}
${args.email}
${args.phone ?? '+91 8077162893'}
${args.location ?? 'Noida, India'}
linkedin.com/in/shashank-singh-610155b1

LINE 2 IS THE TITLE TAGLINE: the second line of the contact block is the candidate's CURRENT role title (the JD-aligned title from ROLE TITLE ALIGNMENT above). It must appear immediately under the name, BEFORE the email line. The PDF renderer treats this as the title tagline below the name. Do not omit it.

CANDIDATE'S CURRENT RESUME (this is the only source of truth - never add experience that is not here):
${args.resumeText.slice(0, 14000)}

TARGET JOB:
Title: ${args.jobTitle}
Company: ${args.jobCompany ?? 'Not specified'}
Description:
${args.jobDescription.slice(0, 5000)}

Output the complete tailored resume in plain ASCII text. No preamble, no explanation, no markdown fences. Start with the candidate's name on the first line.

CRITICAL: do NOT prefix the output with any header label like "Resume", "RESUME", "Curriculum Vitae", "CV", or "PROFILE". The PDF renderer treats the first non-empty line of your output as the candidate's NAME - if you put "Resume" first, the literal word "Resume" will be rendered huge in the header band where the candidate's name should be. The very first non-empty line MUST be the candidate's full name (e.g. "SHASHANK SINGH"). The very second line MUST be the role title tagline.`;

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
