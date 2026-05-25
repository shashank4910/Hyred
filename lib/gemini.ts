import { GoogleGenerativeAI } from '@google/generative-ai';
import type { ResumeInsights } from './types';

function getClient() {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('Missing GEMINI_API_KEY env var');
  return new GoogleGenerativeAI(key);
}

/**
 * Embed a piece of text using Gemini text-embedding-004 (768 dims).
 */
export async function embed(text: string): Promise<number[]> {
  const client = getClient();
  const model = client.getGenerativeModel({ model: 'text-embedding-004' });
  // Cap input length to keep us safely within token limits.
  const trimmed = text.slice(0, 8000);
  const res = await model.embedContent(trimmed);
  return res.embedding.values;
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
  const model = client.getGenerativeModel({
    model: 'gemini-1.5-flash',
    generationConfig: {
      responseMimeType: 'application/json',
      temperature: 0.2,
    },
  });

  const prompt = `You are a senior tech recruiter. Score how well this job matches the candidate.

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
  90-100 = excellent fit, candidate should apply immediately
  75-89  = strong fit, worth applying
  60-74  = reasonable fit, low priority
  <60    = poor fit, skip

Consider: seniority alignment, domain match, required skills, location/remote fit.
Penalize: heavy mismatch in seniority, irrelevant domain, missing must-have skills.

Respond with strict JSON: {"score": <int 0-100>, "reason": "<one or two sentences>"}`;

  const res = await model.generateContent(prompt);
  const text = res.response.text();
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
  const model = client.getGenerativeModel({
    model: 'gemini-1.5-flash',
    generationConfig: { temperature: 0.7 },
  });

  const prompt = `Write a concise, confident cover letter (max 220 words) for this job.
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

  const res = await model.generateContent(prompt);
  return res.response.text().trim();
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
  const model = client.getGenerativeModel({
    model: 'gemini-1.5-flash',
    generationConfig: {
      responseMimeType: 'application/json',
      temperature: 0.2,
    },
  });

  const prompt = `Read this resume and extract structured insights.

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

  const res = await model.generateContent(prompt);
  const text = res.response.text();
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
  const model = client.getGenerativeModel({
    model: 'gemini-1.5-flash',
    generationConfig: {
      responseMimeType: 'application/json',
      temperature: 0.1,
    },
  });

  const prompt = `Given a job description and a list of candidate skills, identify which candidate skills are mentioned or strongly implied by the JD, and which key skills the JD asks for that the candidate is missing.

CANDIDATE SKILLS:
${args.candidateSkills.join(', ')}

JOB DESCRIPTION:
${args.jobDescription.slice(0, 4000)}

Return strict JSON:
{
  "matched": [<candidate skills that appear in the JD>],
  "missing": [<up to 6 important skills the JD asks for that aren't in the candidate's list>]
}`;

  const res = await model.generateContent(prompt);
  try {
    const parsed = JSON.parse(res.response.text());
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
