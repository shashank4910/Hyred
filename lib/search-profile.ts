/**
 * AI-generated job search profile.
 *
 * Instead of regex-based heuristics, we use the LLM to read the user's
 * resume + preferences and generate an optimal search strategy:
 *  - Best keywords for keyword-search APIs (Adzuna, etc.)
 *  - Title patterns to accept (positive matches)
 *  - Title patterns to reject (anti-patterns)
 *  - Domain alternatives (adjacent roles also relevant)
 *
 * This profile is cached in the DB and only regenerated when stale.
 */

import OpenAI from 'openai';
import type { Preferences, ResumeInsights } from './types';

const CHAT_MODEL = 'gpt-4o-mini';

export type SearchProfile = {
  /** Single-word or short keywords optimized for job board keyword search.
   *  Prefer niche tools/domains over generic terms. Ordered most→least specific. */
  searchKeywords: string[];

  /** Lowercase substrings that indicate a job title IS relevant.
   *  Job titles containing any of these → accept. */
  titlePatterns: string[];

  /** Lowercase substrings that indicate a job title is NOT relevant.
   *  Job titles containing any of these → reject. */
  antiPatterns: string[];

  /** The user's primary domain (e.g. "Performance Engineering"). */
  primaryDomain: string;

  /** Adjacent domains the user is also qualified for. */
  adjacentDomains: string[];

  /** When this profile was generated (ISO string). */
  generatedAt: string;

  /** Profile schema version, bump if we change the prompt. */
  version: number;
};

// Bump this when you change the prompt above so cached profiles regenerate.
const PROFILE_VERSION = 2;
const CACHE_DAYS = 7;

/**
 * Check if a cached search profile is still fresh.
 */
export function isProfileFresh(profile: SearchProfile | null | undefined): boolean {
  if (!profile) return false;
  if (profile.version !== PROFILE_VERSION) return false;
  const generated = new Date(profile.generatedAt).getTime();
  if (isNaN(generated)) return false;
  const ageMs = Date.now() - generated;
  return ageMs < CACHE_DAYS * 24 * 60 * 60 * 1000;
}

/**
 * Generate a job search profile by asking GPT to analyze the resume.
 * This is THE smart filter — replaces the previous regex-based query builder.
 */
export async function generateSearchProfile(args: {
  resumeText: string;
  preferences?: Preferences;
  insights?: ResumeInsights | null;
}): Promise<SearchProfile> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('Missing OPENAI_API_KEY env var');
  const client = new OpenAI({ apiKey: key });

  const prefsBlock = args.preferences
    ? `\nUSER PREFERENCES:\nTarget roles: ${(args.preferences.roles ?? []).join(', ')}\nLocations: ${(args.preferences.locations ?? []).join(', ')}\nRemote-only: ${args.preferences.remote_only ?? false}\n`
    : '';

  const insightsBlock = args.insights
    ? `\nRESUME INSIGHTS (already extracted):\nTop skills: ${(args.insights.top_skills ?? []).join(', ')}\nSuggested roles: ${(args.insights.suggested_roles ?? []).join(', ')}\nSeniority: ${args.insights.seniority ?? 'unknown'}\nYears experience: ${args.insights.years_experience ?? 'unknown'}\n`
    : '';

  const prompt = `You are an expert technical recruiter helping a candidate find relevant jobs on job boards (Adzuna, Naukri, LinkedIn-style APIs that do keyword search).

Read this resume and generate the OPTIMAL search strategy.
${prefsBlock}${insightsBlock}
RESUME:
${args.resumeText.slice(0, 6000)}

OUTPUT a JSON object with this exact shape:
{
  "primaryDomain": "<the candidate's main professional domain in 2-4 words, e.g. 'Performance Engineering', 'Frontend Development'>",
  "adjacentDomains": [<3-5 related domains the candidate is also qualified for, e.g. for a performance engineer: ['QA Automation', 'SRE', 'Test Engineering']>],
  "searchKeywords": [<8-12 keywords/phrases optimized for keyword search APIs. CRITICAL RULES:
    - Prefer SINGLE WORDS or 2-word phrases that are UNIQUE to this domain (e.g. 'loadrunner', 'jmeter', 'kubernetes')
    - AVOID long generic phrases like 'Senior Software Engineer' (too many false matches)
    - Include domain-specific niche tools/technologies first (most signal)
    - Then short role titles like 'performance tester', 'load testing'
    - Order from MOST specific to LEAST specific
    - Use lowercase
  >],
  "titlePatterns": [<10-15 lowercase substrings. If a job title contains ANY of these, the job is LIKELY relevant. CRITICAL — use COMPOUND/SPECIFIC phrases, NOT ambiguous single words. Examples for performance engineer: ['performance test', 'performance engineer', 'performance tester', 'load test', 'stress test', 'jmeter', 'loadrunner', 'sdet', 'qa automation', 'test automation', 'software engineer in test', 'site reliability', 'sre engineer', 'quality engineer', 'reliability engineer']. AVOID single ambiguous words like 'performance' (matches "Performance Marketer", "Investment Performance Analyst" — false positives) or 'analyst' (matches finance roles).>],
  "antiPatterns": [<8-15 lowercase substrings that indicate a job is DEFINITELY NOT relevant. These are stronger than titlePatterns and override them. Examples for performance engineer: ['frontend', 'react developer', 'angular developer', 'mobile developer', 'ios developer', 'android developer', 'sales', 'marketing', 'marketer', 'designer', 'product manager', 'data scientist', 'machine learning', 'business analyst', 'investment performance', 'asset performance', 'financial analyst', 'video content', 'social media']>]
}

GUIDANCE:
- searchKeywords: think "what 1-2 word query would Adzuna's keyword search return mostly relevant jobs for?". Niche tools work best.
- titlePatterns: BE PRECISE. Use compound phrases that uniquely identify the domain. NEVER use a single ambiguous word that has different meanings in different fields (e.g. don't use 'performance' alone — use 'performance test', 'performance engineer', 'performance testing').
- antiPatterns: include domain-specific noise patterns. For "performance engineer", explicitly reject finance terms like 'investment performance', 'asset performance', 'financial analyst', 'performance marketer' — these jobs use the word "performance" in a non-engineering sense.
- antiPatterns: be aggressive — these jobs will be filtered out without AI scoring, saving cost.
- For specific roles (like a performance engineer), DON'T put 'engineer' in antiPatterns since most matching titles end in 'engineer'.

Output strict JSON only.`;

  const res = await client.chat.completions.create({
    model: CHAT_MODEL,
    response_format: { type: 'json_object' },
    temperature: 0.3,
    messages: [
      {
        role: 'system',
        content:
          'You are a precision job-search strategist. You generate optimal keyword search strategies and title pattern filters for keyword-based job board APIs. Output strict JSON.',
      },
      { role: 'user', content: prompt },
    ],
  });

  const text = res.choices[0]?.message?.content ?? '{}';

  try {
    const parsed = JSON.parse(text);

    const cleanArray = (v: unknown, max = 20): string[] => {
      if (!Array.isArray(v)) return [];
      return v
        .map(String)
        .map((s) => s.trim().toLowerCase())
        .filter((s) => s.length >= 2 && s.length <= 60)
        .slice(0, max);
    };

    return {
      primaryDomain: typeof parsed.primaryDomain === 'string'
        ? parsed.primaryDomain.slice(0, 80)
        : 'Software Engineering',
      adjacentDomains: cleanArray(parsed.adjacentDomains, 6),
      searchKeywords: cleanArray(parsed.searchKeywords, 12),
      titlePatterns: cleanArray(parsed.titlePatterns, 20),
      antiPatterns: cleanArray(parsed.antiPatterns, 20),
      generatedAt: new Date().toISOString(),
      version: PROFILE_VERSION,
    };
  } catch (e) {
    throw new Error(`Failed to parse search profile JSON: ${(e as Error).message}`);
  }
}

/**
 * Apply pre-filter using the search profile's title patterns.
 * Returns { keep, drop, maybe } classification — used BEFORE expensive LLM scoring.
 */
export function classifyByTitle<T extends { title: string }>(
  jobs: T[],
  profile: SearchProfile,
): { keep: T[]; maybe: T[]; drop: T[] } {
  const keep: T[] = [];
  const maybe: T[] = [];
  const drop: T[] = [];

  const titlePatternsLower = profile.titlePatterns.map((p) => p.toLowerCase());
  const antiPatternsLower = profile.antiPatterns.map((p) => p.toLowerCase());

  for (const job of jobs) {
    const titleLower = (job.title ?? '').toLowerCase();

    // Anti-patterns are absolute — drop immediately
    const matchedAnti = antiPatternsLower.some((p) => titleLower.includes(p));
    if (matchedAnti) {
      drop.push(job);
      continue;
    }

    // Positive title match → strong keep
    const matchedPositive = titlePatternsLower.some((p) =>
      titleLower.includes(p),
    );
    if (matchedPositive) {
      keep.push(job);
      continue;
    }

    // No clear signal from title — let AI decide later
    maybe.push(job);
  }

  return { keep, maybe, drop };
}

/**
 * Use AI to do batched relevance checks on "maybe" jobs.
 * One API call processes up to 15 jobs.
 *
 * This is much cheaper than full scoring and removes obvious mismatches
 * before we spend money scoring them.
 */
export async function aiRelevanceFilter(args: {
  profile: SearchProfile;
  jobs: { id: string; title: string; company: string | null; description: string | null }[];
}): Promise<{ relevantIds: Set<string>; checked: number }> {
  if (args.jobs.length === 0) return { relevantIds: new Set(), checked: 0 };

  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('Missing OPENAI_API_KEY env var');
  const client = new OpenAI({ apiKey: key });

  const relevantIds = new Set<string>();
  const BATCH_SIZE = 15;
  let checked = 0;

  for (let i = 0; i < args.jobs.length; i += BATCH_SIZE) {
    const batch = args.jobs.slice(i, i + BATCH_SIZE);

    const jobsList = batch
      .map(
        (j, idx) =>
          `[${idx}] Title: "${j.title}"${j.company ? ` | Company: ${j.company}` : ''}${j.description ? ` | First 200 chars: ${j.description.slice(0, 200)}` : ''}`,
      )
      .join('\n');

    const prompt = `You are filtering jobs for a candidate.

CANDIDATE'S PROFESSIONAL DOMAIN:
Primary: ${args.profile.primaryDomain}
Adjacent (also relevant): ${args.profile.adjacentDomains.join(', ')}

JOBS TO CLASSIFY:
${jobsList}

For EACH job, decide if it's relevant to the candidate's domain. Return a JSON array of indices that ARE relevant.

Be inclusive: if a job MIGHT be relevant (adjacent domain, transferable skills), include it.
Be strict: completely unrelated domains (different field entirely) → exclude.

Output strict JSON: {"relevant": [<indices that are relevant>]}`;

    try {
      const res = await client.chat.completions.create({
        model: CHAT_MODEL,
        response_format: { type: 'json_object' },
        temperature: 0.1,
        messages: [
          {
            role: 'system',
            content: 'You quickly classify jobs as relevant/irrelevant for a candidate. Output JSON only.',
          },
          { role: 'user', content: prompt },
        ],
      });

      const parsed = JSON.parse(res.choices[0]?.message?.content ?? '{}');
      const indices = Array.isArray(parsed.relevant) ? parsed.relevant : [];
      for (const idx of indices) {
        const i = Number(idx);
        if (Number.isInteger(i) && i >= 0 && i < batch.length) {
          relevantIds.add(batch[i].id);
        }
      }
      checked += batch.length;
    } catch (e) {
      // On error, default to keeping all (don't lose jobs due to AI failure)
      for (const j of batch) relevantIds.add(j.id);
      console.warn('[ai-relevance] Batch failed, keeping all:', (e as Error).message);
    }
  }

  return { relevantIds, checked };
}
