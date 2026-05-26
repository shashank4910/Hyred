import type { Preferences, ResumeInsights } from '../types';

/**
 * Automatically builds optimal search queries for job board APIs
 * based on a user's profile data. No manual configuration needed.
 *
 * Strategy:
 *  1. Use explicit target roles from preferences (highest priority)
 *  2. Use AI-suggested roles from resume insights
 *  3. Use top skills as search terms (good for niche tools like "loadrunner")
 *  4. Expand domain-specific synonyms (e.g. performance engineer → performance tester, load testing)
 *  5. Combine seniority + domain for compound queries
 *
 * Designed for multi-user: each user gets personalized queries
 * derived entirely from their own profile data.
 */
export function buildSearchQueries(opts: {
  preferences?: Preferences;
  insights?: ResumeInsights | null;
  maxQueries?: number;
}): string[] {
  const { preferences, insights, maxQueries = 12 } = opts;
  const queries: string[] = [];
  const seen = new Set<string>();

  function add(q: string) {
    const normalized = q.toLowerCase().trim();
    if (normalized.length < 3) return;
    if (seen.has(normalized)) return;
    seen.add(normalized);
    queries.push(q.trim());
  }

  // --- Priority 1: Distinctive single-word skills (HIGHEST SIGNAL) ---
  // Single-word niche tools (loadrunner, jmeter, dynatrace, etc.) work
  // best with Adzuna's `what` keyword search. Multi-word phrases do
  // AND-matching which dilutes results.
  if (insights?.top_skills?.length) {
    const singleWord = insights.top_skills
      .filter(s => !s.includes(' ') && s.length > 4)
      .slice(0, 6);
    for (const skill of singleWord) {
      add(skill);
    }
  }

  // --- Priority 2: Domain-specific 2-word tool phrases ---
  // "performance testing", "load testing" — short enough to match well
  const domain = guessDomain(insights);
  if (domain) {
    const expansions = DOMAIN_EXPANSIONS[domain] ?? [];
    const shortExpansions = expansions.filter(e => e.split(' ').length <= 2);
    for (const expansion of shortExpansions) {
      add(expansion);
    }
  }

  // --- Priority 3: AI-suggested role titles ---
  if (insights?.suggested_roles?.length) {
    for (const role of insights.suggested_roles.slice(0, 3)) {
      add(role);
    }
  }

  // --- Priority 4: Multi-word skills (less effective but useful) ---
  if (insights?.top_skills?.length) {
    const multiWord = insights.top_skills
      .filter(s => s.includes(' '))
      .slice(0, 2);
    for (const skill of multiWord) {
      add(skill);
    }
  }

  // --- Priority 5: User's explicit preference roles ---
  // (Lower priority because long phrases AND-match poorly on Adzuna)
  if (preferences?.roles?.length) {
    for (const role of preferences.roles.slice(0, 3)) {
      add(role);
    }
  }

  // --- Priority 6: Seniority + domain combinations ---
  if (insights?.seniority && insights.seniority !== 'unknown' && domain) {
    add(`${insights.seniority} ${domain}`);
  }

  // --- Limit total queries to stay within API budget ---
  return queries.slice(0, maxQueries);
}

/**
 * Domain-specific query expansions.
 * When we detect a user is in a certain domain, we automatically add
 * related job title variants and tool names that surface relevant postings.
 *
 * This is what makes the system smart — a performance engineer doesn't
 * need to manually type "performance tester", "load testing", "dynatrace" etc.
 * The system knows these are all part of the same domain.
 */
const DOMAIN_EXPANSIONS: Record<string, string[]> = {
  'performance engineer': [
    'performance tester',
    'performance test engineer',
    'load testing',
    'performance testing',
    'appdynamics',
    'dynatrace',
    'splunk',
    'neoload',
  ],
  'devops engineer': [
    'site reliability engineer',
    'SRE',
    'platform engineer',
    'infrastructure engineer',
    'cloud engineer',
    'kubernetes',
    'terraform',
  ],
  'data scientist': [
    'machine learning engineer',
    'ML engineer',
    'AI engineer',
    'deep learning',
    'NLP engineer',
    'data analyst',
  ],
  'data engineer': [
    'analytics engineer',
    'ETL developer',
    'big data engineer',
    'data platform',
    'spark',
    'airflow',
  ],
  'frontend engineer': [
    'frontend developer',
    'UI developer',
    'react developer',
    'angular developer',
    'web developer',
    'javascript developer',
  ],
  'backend engineer': [
    'backend developer',
    'server-side developer',
    'API developer',
    'java developer',
    'python developer',
    'node.js developer',
  ],
  'mobile developer': [
    'iOS developer',
    'android developer',
    'flutter developer',
    'react native developer',
    'mobile engineer',
  ],
  'QA engineer': [
    'test automation engineer',
    'SDET',
    'quality engineer',
    'automation tester',
    'selenium',
    'cypress',
  ],
  'security engineer': [
    'cybersecurity engineer',
    'application security',
    'penetration tester',
    'security analyst',
    'SOC analyst',
  ],
  'cloud engineer': [
    'AWS engineer',
    'Azure engineer',
    'cloud architect',
    'cloud infrastructure',
    'solutions architect',
  ],
  'full stack developer': [
    'full stack engineer',
    'web developer',
    'MERN developer',
    'MEAN developer',
    'software developer',
  ],
  'software engineer': [
    'software developer',
    'application developer',
    'programmer',
  ],
};

/**
 * Guess the candidate's primary domain from their skills/roles.
 * Used to trigger domain-specific query expansions.
 */
function guessDomain(insights?: ResumeInsights | null): string | null {
  if (!insights) return null;

  const skills = (insights.top_skills ?? []).join(' ').toLowerCase();
  const roles = (insights.suggested_roles ?? []).join(' ').toLowerCase();
  const combined = `${skills} ${roles}`;

  // Order matters — more specific first
  if (/performance|load test|jmeter|gatling|loadrunner|neoload/i.test(combined)) {
    return 'performance engineer';
  }
  if (/devops|kubernetes|docker|terraform|ci.cd|ansible/i.test(combined)) {
    return 'devops engineer';
  }
  if (/data scien|machine learn|deep learn|nlp|pytorch|tensorflow/i.test(combined)) {
    return 'data scientist';
  }
  if (/data engineer|spark|airflow|etl|pipeline|dbt/i.test(combined)) {
    return 'data engineer';
  }
  if (/react|angular|vue|frontend|css|tailwind|next\.?js/i.test(combined)) {
    return 'frontend engineer';
  }
  if (/node|express|spring|backend|api|microservice|django/i.test(combined)) {
    return 'backend engineer';
  }
  if (/ios|android|swift|kotlin|flutter|react native/i.test(combined)) {
    return 'mobile developer';
  }
  if (/qa|test auto|selenium|cypress|playwright|sdet/i.test(combined)) {
    return 'QA engineer';
  }
  if (/security|pentest|soc|siem|vulnerability|appsec/i.test(combined)) {
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
