/**
 * Enrich matched/missing skill chips when scoreJob post-filtering or a short JD
 * left too few skills for the dashboard card.
 */
import { isSkillPresentInJd } from './jd-skill-match';
import { sanitizeJobDescriptionForAI } from './jd-fetcher';

const MIN_SKILLS_FOR_DISPLAY = 3;
const MAX_SKILLS = 5;

function dedupeSkills(skills: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of skills) {
    const t = s.trim();
    if (!t) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
}

/** Merge profile top_skills that appear in the JD into matched list. */
export function supplementMatchedFromProfile(
  matchedSkills: string[],
  topSkills: string[] | undefined,
  jobDescription: string | null,
  jobTitle: string | null,
): string[] {
  const sanitized = sanitizeJobDescriptionForAI(jobDescription);
  let matched = dedupeSkills(matchedSkills);

  if (matched.length >= MIN_SKILLS_FOR_DISPLAY || !topSkills?.length) {
    return matched.slice(0, MAX_SKILLS);
  }

  const seen = new Set(matched.map((s) => s.toLowerCase()));
  for (const skill of topSkills) {
    if (matched.length >= MAX_SKILLS) break;
    const key = skill.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    if (isSkillPresentInJd(skill, sanitized, jobTitle)) {
      matched.push(skill.trim());
      seen.add(key);
    }
  }

  return matched.slice(0, MAX_SKILLS);
}

/** Keep only missing skills that the JD actually mentions. */
export function filterMissingSkillsForJd(
  missingSkills: string[],
  jobDescription: string | null,
  jobTitle: string | null,
): string[] {
  const sanitized = sanitizeJobDescriptionForAI(jobDescription);
  return dedupeSkills(missingSkills)
    .filter((s) => isSkillPresentInJd(s, sanitized, jobTitle))
    .slice(0, MAX_SKILLS);
}

/**
 * After scoreJob: pad sparse chips from profile skills; optionally run matchSkills
 * when still too few (short JD at ingest time is the usual cause).
 */
export async function enrichScoreJobSkills(args: {
  matchedSkills: string[];
  missingSkills: string[];
  score: number;
  resume: string;
  topSkills?: string[];
  jobTitle: string;
  jobDescription: string | null;
  profileId?: string;
}): Promise<{ matchedSkills: string[]; missingSkills: string[] }> {
  let matched = supplementMatchedFromProfile(
    args.matchedSkills,
    args.topSkills,
    args.jobDescription,
    args.jobTitle,
  );
  let missing = filterMissingSkillsForJd(
    args.missingSkills,
    args.jobDescription,
    args.jobTitle,
  );

  const total = matched.length + missing.length;
  const sanitized = sanitizeJobDescriptionForAI(args.jobDescription);

  if (
    total < MIN_SKILLS_FOR_DISPLAY &&
    args.score >= 55 &&
    sanitized.length >= 200
  ) {
    try {
      const { matchSkills } = await import('./gemini');
      const ms = await matchSkills({
        jobDescription: sanitized,
        resumeText: args.resume,
        topSkills: args.topSkills,
        profileId: args.profileId,
      });
      if (ms.matched.length > matched.length) {
        matched = ms.matched.slice(0, MAX_SKILLS);
      }
      if (ms.missing.length > missing.length) {
        missing = ms.missing.slice(0, MAX_SKILLS);
      }
    } catch {
      // keep scoreJob result
    }
  }

  return { matchedSkills: matched, missingSkills: missing };
}

const stripHtmlForSkills = (s: string) =>
  s.replace(/<[^>]*>/g, ' ').replace(/&[a-z]+;/gi, ' ');

/** Dashboard / API: pad sparse chips without an extra LLM call. */
export function enrichMatchListSkills(
  matchedSkills: string[] | null | undefined,
  missingSkills: string[] | null | undefined,
  topSkills: string[],
  jobTitle: string,
  jobDescription: string | null | undefined,
): { matched_skills: string[]; missing_skills: string[] } {
  const jdPlain = stripHtmlForSkills(jobDescription ?? '');
  const matched = supplementMatchedFromProfile(
    matchedSkills ?? [],
    topSkills,
    jdPlain,
    jobTitle,
  );
  const missing = filterMissingSkillsForJd(
    missingSkills ?? [],
    jdPlain,
    jobTitle,
  );
  return { matched_skills: matched, missing_skills: missing };
}
