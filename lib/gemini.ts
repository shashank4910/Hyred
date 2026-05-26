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

SCORING GUIDELINES:
- If the job requires skills that exist in the candidate's resume, score 70+.
- If the job is in the same DOMAIN (e.g. both are testing/performance/QA), score at least 60 even if specific tools differ.
- Tools can be learned — weight domain experience and seniority more than specific tool names.
- Do NOT heavily penalize for missing 1-2 nice-to-have skills if core experience aligns.
- Location mismatch alone should NOT drop score below 60 if skills match.
- Remote jobs should get a small boost for candidates open to remote.

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
 * Given a job description and a list of candidate skills, return which
 * skills are mentioned in the JD. Used for the skill-match visualization.
 */
export async function matchSkills(args: {
  jobDescription: string;
  candidateSkills: string[];
}): Promise<{ matched: string[]; missing: string[] }> {
  if (!args.candidateSkills.length) return { matched: [], missing: [] };

  const client = getClient();

  const userPrompt = `Given a job description and a list of candidate skills, identify which candidate skills are mentioned or strongly implied by the JD, and which key skills the JD asks for that the candidate is missing.

CANDIDATE SKILLS:
${args.candidateSkills.join(', ')}

JOB DESCRIPTION:
${args.jobDescription.slice(0, 4000)}

Return strict JSON:
{
  "matched": [<candidate skills that appear in the JD>],
  "missing": [<up to 6 important skills the JD asks for that aren't in the candidate's list>]
}`;

  const res = await client.chat.completions.create({
    model: CHAT_MODEL,
    response_format: { type: 'json_object' },
    temperature: 0.1,
    messages: [{ role: 'user', content: userPrompt }],
  });

  try {
    const parsed = JSON.parse(res.choices[0]?.message?.content ?? '{}');
    const matched = Array.isArray(parsed.matched)
      ? parsed.matched.map(String).filter((s: string) => args.candidateSkills.includes(s))
      : [];
    const missing = Array.isArray(parsed.missing)
      ? parsed.missing.slice(0, 6).map(String)
      : [];
    return { matched, missing };
  } catch {
    return { matched: [], missing: [] };
  }
}
