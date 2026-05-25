import { GoogleGenerativeAI } from '@google/generative-ai';

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
    model: 'gemini-2.0-flash',
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
    model: 'gemini-2.0-flash',
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
