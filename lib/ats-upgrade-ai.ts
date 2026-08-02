/**
 * LLM one-shot resume upgrade for ATS Fix (truth-preserving).
 */

import { chat } from './gemini';
import { sanitizeJobDescriptionForAI } from './jd-fetcher';
import { checkAtsCompatibility, type AtsCheckResult } from './ats-checker';
import { planAtsUpgrade, type AtsUpgradeIntensity } from './ats-upgrade';

export interface UpgradeAtsResumeArgs {
  resumeText: string;
  result: AtsCheckResult;
  jobDescription?: string;
  profileId?: string;
}

export interface UpgradeAtsResumeResult {
  upgradedResume: string;
  intensity: AtsUpgradeIntensity;
  creditCost: number;
  beforeScore: number;
  afterScore: number;
  afterResult: AtsCheckResult;
}

function intensityInstructions(intensity: AtsUpgradeIntensity): string {
  if (intensity === 'light') {
    return `INTENSITY: LIGHT POLISH
- Change as little as possible.
- Fix formatting, section headers (ALL CAPS), bullet consistency ("- ").
- Light wording cleanup only. Do NOT rewrite most bullets.
- Do NOT invent metrics, tools, employers, or titles.`;
  }
  if (intensity === 'medium') {
    return `INTENSITY: FOCUSED UPGRADE
- Rebuild into a clean ATS layout when structure is weak.
- Strengthen weak bullets with clearer verbs — only using facts already in the resume.
- Improve skills section clarity.
- Do NOT invent metrics, employers, degrees, or tools not already supported by the resume.
- Prefer keeping numbers that already exist; never fabricate new ones.`;
  }
  return `INTENSITY: DEEP ATS REBUILD
- Produce a complete ATS-friendly resume from the candidate's existing facts.
- Required sections (ALL CAPS headers): PROFESSIONAL SUMMARY, TECHNICAL SKILLS (or CORE COMPETENCIES), PROFESSIONAL EXPERIENCE, EDUCATION. Add others only if present in the source.
- Every experience bullet starts with "- ".
- Rewrite for clarity and impact WITHOUT inventing employers, titles, dates, degrees, tools, or metrics.
- If a bullet has no number, do not invent one — use stronger truthful wording instead.`;
}

export async function upgradeAtsResume(
  args: UpgradeAtsResumeArgs,
): Promise<UpgradeAtsResumeResult> {
  const plan = planAtsUpgrade(args.result);
  const weakFeedback = Object.entries(args.result.breakdown)
    .filter(([, c]) => c.score < 75)
    .map(([k, c]) => `- ${k}: ${c.score}/100 — ${c.feedback}`)
    .join('\n');

  const jdBlock = args.jobDescription
    ? `\nTARGET JOB DESCRIPTION (context only — do not invent JD skills the resume does not support):\n${sanitizeJobDescriptionForAI(args.jobDescription).slice(0, 2500)}\n`
    : '';

  const system = `You are Hyred Resume Upgrade. Return JSON only:
{ "resume": "<full upgraded plain-text resume>" }

Rules:
- Output ONE complete resume as plain text (no markdown fences).
- Line 1: candidate name. Line 2: short role tagline from THEIR experience. Then contact lines, then ALL-CAPS section headers and "- " bullets.
- NEVER invent employers, job titles, dates, degrees, certifications, tools, user counts, revenue, or percentages.
- Preserve every real employer and role from the source resume (you may reorder sections for ATS clarity).
- ASCII only. No tables, no multi-column layouts, no emoji.
- ${intensityInstructions(plan.intensity)}`;

  const user = `CURRENT ATS SCORE: ${args.result.overallScore}/100
UPGRADE MODE: ${plan.label} (${plan.intensity})

WEAK AREAS:
${weakFeedback || '- None flagged — light polish only.'}
${jdBlock}
SOURCE RESUME:
"""
${args.resumeText.slice(0, 14000)}
"""

Return JSON with the full upgraded resume text.`;

  const raw = await chat(system, user, 0.35, true, 'ats_upgrade', args.profileId);
  let parsed: { resume?: string };
  try {
    parsed = JSON.parse(raw) as { resume?: string };
  } catch {
    throw new Error('Model returned invalid JSON for resume upgrade.');
  }

  const upgraded = (parsed.resume ?? '').trim();
  if (upgraded.length < 80) {
    throw new Error('Upgrade produced an empty or too-short resume.');
  }

  const afterResult = checkAtsCompatibility(
    upgraded,
    undefined,
    args.jobDescription || undefined,
  );

  return {
    upgradedResume: upgraded,
    intensity: plan.intensity,
    creditCost: plan.creditCost,
    beforeScore: args.result.overallScore,
    afterScore: afterResult.overallScore,
    afterResult,
  };
}
