import type { Preferences, ResumeInsights } from '../types';

/**
 * Automatically builds optimal search queries for job board APIs
 * based on a user's profile data. No manual configuration needed.
 *
 * Strategy:
 *  1. Use explicit target roles from preferences (highest priority)
 *  2. Use AI-suggested roles from resume insights
 *  3. Use top skills as search terms (good for niche tools like "loadrunner")
 *  4. Combine role + location for geo-targeted searches
 *
 * Designed for multi-user: each user gets personalized queries
 * derived entirely from their own profile data.
 */
export function buildSearchQueries(opts: {
  preferences?: Preferences;
  insights?: ResumeInsights | null;
  maxQueries?: number;
}): string[] {
  const { preferences, insights, maxQueries = 8 } = opts;
  const queries: string[] = [];
  const seen = new Set<string>();

  function add(q: string) {
    const normalized = q.toLowerCase().trim();
    if (normalized.length < 3) return;
    if (seen.has(normalized)) return;
    seen.add(normalized);
    queries.push(q.trim());
  }

  // --- Priority 1: Explicit target roles (user set these in preferences) ---
  if (preferences?.roles?.length) {
    for (const role of preferences.roles) {
      add(role);
    }
  }

  // --- Priority 2: AI-suggested roles from resume analysis ---
  if (insights?.suggested_roles?.length) {
    for (const role of insights.suggested_roles) {
      add(role);
    }
  }

  // --- Priority 3: Top skills as search queries ---
  // Especially effective for niche tools (loadrunner, gatling, jmeter, etc.)
  // that are likely to appear in job titles or requirements
  if (insights?.top_skills?.length) {
    // Prefer skills that are likely to be in job titles (longer, more specific)
    const sortedSkills = [...insights.top_skills]
      .filter(s => s.length > 3) // Skip "sql", "git" etc. — too generic
      .sort((a, b) => b.length - a.length); // Longer = more specific = better query

    for (const skill of sortedSkills.slice(0, 4)) {
      add(skill);
    }
  }

  // --- Priority 4: Seniority + domain combinations ---
  // e.g. "senior performance engineer", "staff engineer"
  if (insights?.seniority && insights.seniority !== 'unknown') {
    const seniority = insights.seniority;
    const domain = guessDomain(insights);
    if (domain) {
      add(`${seniority} ${domain}`);
    }
  }

  // --- Limit total queries to stay within API budget ---
  return queries.slice(0, maxQueries);
}

/**
 * Guess the candidate's primary domain from their skills/roles.
 * Used to create compound queries like "senior performance engineer".
 */
function guessDomain(insights: ResumeInsights): string | null {
  const skills = (insights.top_skills ?? []).join(' ').toLowerCase();
  const roles = (insights.suggested_roles ?? []).join(' ').toLowerCase();
  const combined = `${skills} ${roles}`;

  // Order matters — more specific first
  if (/performance|load test|jmeter|gatling|loadrunner/i.test(combined)) {
    return 'performance engineer';
  }
  if (/devops|kubernetes|docker|terraform|ci.cd/i.test(combined)) {
    return 'devops engineer';
  }
  if (/data scien|machine learn|deep learn|nlp|pytorch/i.test(combined)) {
    return 'data scientist';
  }
  if (/data engineer|spark|airflow|etl|pipeline/i.test(combined)) {
    return 'data engineer';
  }
  if (/react|angular|vue|frontend|css|tailwind/i.test(combined)) {
    return 'frontend engineer';
  }
  if (/node|express|spring|backend|api|microservice/i.test(combined)) {
    return 'backend engineer';
  }
  if (/ios|android|swift|kotlin|flutter|react native/i.test(combined)) {
    return 'mobile developer';
  }
  if (/qa|test auto|selenium|cypress|playwright/i.test(combined)) {
    return 'QA engineer';
  }
  if (/security|pentest|soc|siem|vulnerability/i.test(combined)) {
    return 'security engineer';
  }
  if (/cloud|aws|azure|gcp|infrastructure/i.test(combined)) {
    return 'cloud engineer';
  }
  if (/full.?stack/i.test(combined)) {
    return 'full stack developer';
  }

  return 'software engineer'; // Generic fallback
}
