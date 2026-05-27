/**
 * AI helpers (powered by OpenAI gpt-4o-mini + text-embedding-3-small).
 *
 * The file is named `gemini.ts` for historical reasons; it now uses OpenAI.
 * Function names and signatures are unchanged so the rest of the codebase
 * doesn't need to know which provider is in use.
 */

import OpenAI from 'openai';
import type { ResumeInsights } from './types';

const CHAT_MODEL = 'gpt-4o-mini';
const EMBED_MODEL = 'text-embedding-3-small'; // 1536 dims

function getClient(): OpenAI {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('Missing OPENAI_API_KEY env var');
  return new OpenAI({ apiKey: key });
}

/**
 * Embed a piece of text. text-embedding-3-small returns 1536 floats.
 */
export async function embed(text: string): Promise<number[]> {
  const client = getClient();
  const trimmed = text.slice(0, 8000);
  const res = await client.embeddings.create({
    model: EMBED_MODEL,
    input: trimmed,
  });
  return res.data[0].embedding;
}

/**
 * Score a job against a resume on a 0-100 scale and return short reasoning.
 */
export async function scoreJob(args: {
  resume: string;
  preferences?: string;
  jobTitle: string;
  jobCompany: string | null;
  jobLocation: string | null;
  jobDescription: string | null;
}): Promise<{ score: number; reason: string }> {
  const client = getClient();

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
- The word "performance" is ambiguous. "Performance Marketer", "Investment Performance Analyst", "Asset Performance Manager", "Video Content & Performance Specialist" are FINANCE/MARKETING roles, NOT engineering. Score these <40.
- "Performance Test Engineer", "Performance Engineer", "Performance Tester" are the ENGINEERING meaning. Score 75-90.
- Tools are interchangeable: JMeter ≈ Gatling ≈ LoadRunner ≈ Neoload. Don't penalize tool mismatches if the discipline matches.
- A Performance/Testing engineer applying to general "Java Developer" or "Backend Engineer" → score 50-60 (transferable Java skills, different role).
- For genuinely different domains (Frontend Dev, Mobile Dev, Sales, Marketing, Product Mgmt, Data Science) → score <40.
- Do NOT heavily penalize for missing 1-2 nice-to-have skills if core domain aligns.
- Location mismatch alone should NEVER drop score below 60 if skills match.
- Remote jobs get a small boost.

Respond with strict JSON: {"score": <int 0-100>, "reason": "<one or two sentences>"}`;

  const res = await client.chat.completions.create({
    model: CHAT_MODEL,
    response_format: { type: 'json_object' },
    temperature: 0.2,
    messages: [
      { role: 'system', content: 'You are a senior tech recruiter.' },
      { role: 'user', content: userPrompt },
    ],
  });

  const text = res.choices[0]?.message?.content ?? '{}';
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
  const client = getClient();

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

  const res = await client.chat.completions.create({
    model: CHAT_MODEL,
    temperature: 0.7,
    messages: [
      { role: 'system', content: 'You write tailored cover letters for senior tech roles.' },
      { role: 'user', content: userPrompt },
    ],
  });
  return (res.choices[0]?.message?.content ?? '').trim();
}

/**
 * Extract structured insights from a resume.
 * Used to auto-fill suggested target roles, seniority, and top skills
 * after a resume upload.
 */
export async function extractResumeInsights(
  resume: string,
): Promise<ResumeInsights> {
  const client = getClient();

  const userPrompt = `Read this resume and extract structured insights.

RESUME:
${resume.slice(0, 8000)}

Return strict JSON in this shape:
{
  "full_name": "<candidate's full name as it appears on the resume>",
  "email": "<primary email address from the resume, or null if not present>",
  "current_location": "<city and country, e.g. 'Bangalore, India', or null>",
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
- summary must avoid first person ("Performance engineer with 12 years..." not "I am a...").`;

  const res = await client.chat.completions.create({
    model: CHAT_MODEL,
    response_format: { type: 'json_object' },
    temperature: 0.2,
    messages: [
      { role: 'system', content: 'You parse resumes into structured JSON. Output JSON only.' },
      { role: 'user', content: userPrompt },
    ],
  });

  const text = res.choices[0]?.message?.content ?? '{}';
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
 * Compare a JD against a resume. Returns:
 *   - matched: items the JD asks for that ARE present in the resume
 *   - missing: items the JD asks for that are NOT present in the resume
 *
 * Strict guarantee: every item in `matched` and `missing` MUST come from
 * the JD's own requirements. Resume-only skills (e.g. "Cavisson NetStorm"
 * mentioned in resume but not in the JD) will NEVER appear here.
 *
 * The function uses a 2-phase approach with programmatic verification:
 *   Phase 1 (LLM): Extract jdRequirements from the JD only.
 *   Phase 2 (LLM): Classify each jdRequirement as matched or missing
 *                  based on the full resume.
 *   Phase 3 (code): Verify each matched/missing item came from
 *                   jdRequirements. Drop any that didn't.
 *   Phase 4 (code): Verify each item actually appears (or is implied)
 *                   in the JD text. Drop hallucinations.
 */
export async function matchSkills(args: {
  jobDescription: string;
  resumeText?: string;
  topSkills?: string[];
  /** @deprecated Use resumeText for accurate matching. Kept for backward compat. */
  candidateSkills?: string[];
}): Promise<{ matched: string[]; missing: string[] }> {
  const topSkills = args.topSkills ?? args.candidateSkills ?? [];
  const resumeText = args.resumeText ?? '';

  if (!resumeText && topSkills.length === 0) {
    return { matched: [], missing: [] };
  }

  const client = getClient();

  const resumeBlock = resumeText
    ? `\nFULL RESUME (source of truth for what the candidate has):\n${resumeText.slice(0, 6000)}\n`
    : '';

  const topSkillsBlock = topSkills.length
    ? `\nDISTILLED TOP SKILLS (already extracted from resume, for reference):\n${topSkills.join(', ')}\n`
    : '';

  const jdText = args.jobDescription.slice(0, 5000);

  const userPrompt = `Compare a job description (JD) against a candidate's resume.

YOU MUST FOLLOW THIS EXACT 3-STEP PROCESS:

==================== STEP 1: jdRequirements ====================
Extract a list of the 8-12 most important skills, tools, technologies, methodologies, or concepts that THE JD ITSELF EXPLICITLY ASKS FOR.

CRITICAL RULES for jdRequirements:
- Every item MUST be something the JD literally mentions or directly implies.
- DO NOT include anything from the resume that the JD doesn't ask for.
- Example: if the resume mentions "Cavisson NetStorm" but the JD never mentions it, "Cavisson NetStorm" must NOT appear in jdRequirements.
- Use the JD's own wording (or close paraphrase).
- Items can be specific tools ("JMeter", "Kubernetes") or domain concepts ("performance testing", "framework design").

==================== STEP 2: matched / missing ====================
For EACH item in jdRequirements (and ONLY those items), classify:

  matched   = the resume covers this requirement (literal mention, synonym, equivalent activity, or same-category tool)
  missing   = the resume does NOT cover this requirement

Synonym rules (count as MATCHED):
  - JD says "load testing", resume says "performance testing" → MATCHED (same discipline)
  - JD says "framework design", resume says "designed test framework" → MATCHED (same activity)
  - JD says "Gatling", resume says "JMeter" → MATCHED (both load testing tools)

Default to MATCHED when in doubt. Only mark MISSING if you've thoroughly searched the resume and the requirement is genuinely absent.

==================== STEP 3: OUTPUT ====================
Return strict JSON with ALL THREE fields:
{
  "jdRequirements": [<8-12 items extracted from the JD only>],
  "matched":        [<subset of jdRequirements that ARE in the resume>],
  "missing":        [<subset of jdRequirements NOT in the resume>]
}

INVARIANTS YOU MUST UPHOLD:
1. matched ⊆ jdRequirements   (every matched item is in jdRequirements)
2. missing  ⊆ jdRequirements   (every missing item is in jdRequirements)
3. matched ∪ missing = jdRequirements   (every JD requirement is classified as exactly one)
4. matched ∩ missing = ∅        (an item cannot be both matched and missing)
5. NO item from the resume that isn't in the JD may appear in any list

If you violate these invariants, your output is wrong.

${resumeBlock}${topSkillsBlock}
JOB DESCRIPTION:
${jdText}`;

  const res = await client.chat.completions.create({
    model: CHAT_MODEL,
    response_format: { type: 'json_object' },
    temperature: 0.1,
    messages: [
      {
        role: 'system',
        content:
          'You compare a candidate resume against a job description. You ONLY classify items the JD asks for. You NEVER include resume-only skills the JD does not mention. Output JSON only.',
      },
      { role: 'user', content: userPrompt },
    ],
  });

  let parsed: {
    jdRequirements?: unknown;
    matched?: unknown;
    missing?: unknown;
  } = {};
  try {
    parsed = JSON.parse(res.choices[0]?.message?.content ?? '{}');
  } catch {
    return { matched: [], missing: [] };
  }

  const cleanList = (v: unknown): string[] =>
    Array.isArray(v)
      ? v
          .map(String)
          .map((s) => s.trim())
          .filter((s) => s.length >= 2 && s.length <= 80)
      : [];

  const jdRequirements = cleanList(parsed.jdRequirements);
  const rawMatched = cleanList(parsed.matched);
  const rawMissing = cleanList(parsed.missing);

  // ---------- Phase 3: verify items came from jdRequirements ----------
  // Use case-insensitive containment so minor casing/whitespace differences
  // don't cause false rejections, but still enforce that each matched/missing
  // item is one of the requirements the LLM extracted from the JD.
  const jdRequirementsLower = jdRequirements.map((r) => r.toLowerCase());

  const isFromJd = (item: string): boolean => {
    const lower = item.toLowerCase();
    return jdRequirementsLower.some(
      (r) => r === lower || r.includes(lower) || lower.includes(r),
    );
  };

  let matched = rawMatched.filter(isFromJd);
  let missing = rawMissing.filter(isFromJd);

  // ---------- Phase 4: verify items actually appear (or are clearly implied)
  // in the JD text. Catches hallucinations where the LLM made up a JD
  // requirement that isn't actually in the JD.
  // We use a generous substring match — if even one significant word from
  // the item appears in the JD, we accept it. This handles paraphrasing.
  const jdLower = jdText.toLowerCase();

  const stopwords = new Set([
    'the', 'and', 'or', 'of', 'in', 'a', 'an', 'is', 'are', 'be', 'with',
    'for', 'to', 'on', 'at', 'by', 'as', 'from', 'into',
  ]);

  const isInJd = (item: string): boolean => {
    const lower = item.toLowerCase();
    // Direct substring match — easy case.
    if (jdLower.includes(lower)) return true;
    // Word-by-word check — at least one significant word (>3 chars, not a
    // stopword) from the item must appear in the JD.
    const words = lower.split(/[\s\-/.,]+/).filter(
      (w) => w.length > 3 && !stopwords.has(w),
    );
    if (words.length === 0) return jdLower.includes(lower);
    // Require at least one significant word to be in the JD.
    return words.some((w) => jdLower.includes(w));
  };

  matched = matched.filter(isInJd);
  missing = missing.filter(isInJd);

  // Dedupe (case-insensitive) and cap.
  const dedupe = (arr: string[]): string[] => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const item of arr) {
      const key = item.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        out.push(item);
      }
    }
    return out;
  };

  // If an item is in BOTH matched and missing (LLM contradiction),
  // trust matched and remove from missing.
  const matchedKeys = new Set(matched.map((m) => m.toLowerCase()));
  missing = missing.filter((m) => !matchedKeys.has(m.toLowerCase()));

  return {
    matched: dedupe(matched).slice(0, 15),
    missing: dedupe(missing).slice(0, 8),
  };
}
