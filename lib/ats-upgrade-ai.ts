/**
 * LLM one-shot resume upgrade for ATS Fix (truth-preserving, high quality).
 * Target: ~9.5/10 structural + editing quality vs source resume.
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
    return `INTENSITY: LIGHT POLISH (still must hit the quality bar below)
- Prefer minimal wording changes, but DO apply all QUALITY BAR rules.
- Fix headers, bullets, fluff removal, and dedupe even in light mode.`;
  }
  if (intensity === 'medium') {
    return `INTENSITY: FOCUSED UPGRADE
- Rebuild weak structure into the required ATS layout.
- Strengthen bullets with clearer verbs using ONLY source facts.
- Apply every QUALITY BAR rule aggressively.`;
  }
  return `INTENSITY: DEEP ATS REBUILD
- Full ATS-friendly rebuild from source facts only.
- Required sections (ALL CAPS), in order: PROFESSIONAL SUMMARY, PROFESSIONAL EXPERIENCE, TECHNICAL SKILLS, EDUCATION.
- Add PROJECTS (between PROFESSIONAL EXPERIENCE and TECHNICAL SKILLS) only if source has distinct project work not already covered in Experience.
- Apply every QUALITY BAR rule aggressively.`;
}

const QUALITY_BAR = `QUALITY BAR (must hit ~9.5/10 — non-negotiable):

1) TRUTH LOCK — never invent or assume:
   - Do NOT invent employers, titles, tools, domains, metrics, %, $, headcount, or awards.
   - Do NOT invent company city/country unless the SOURCE states that company's location.
   - Do NOT write "Present" / "Current" unless the source clearly says current / till date / working / present / from <date> with no end date AND that role is the latest. Prefer the exact date wording from source when unsure (e.g. "From June 2019").
   - Personal city (contact) ≠ employer city. Never copy personal location onto the employer line.
   - NEVER invent features, integrations, or capabilities the source never mentions — e.g. do not add "payment gateway", "data integrity checks", "enterprise software solutions", "scalable architecture", "microservices", "cloud-native" unless those exact concepts (not just similar-sounding buzzwords) appear in the SOURCE. When rewriting a bullet, paraphrase what the SOURCE already says — do not extend its scope or imply extra systems/features that were not stated.
   - If unsure whether something is real or an embellishment, leave it out rather than guess.

2) KEEP REAL SIGNAL from the source:
   - Preserve every employer + job title that appears in the source.
   - Keep domain keywords already present (e.g. e-commerce, travel, banking) — do not drop them.
   - Keep tools/frameworks that appear (Selenium, TestNG, Rest Assured, Jenkins, JIRA, etc.).
   - Keep real numbers that already exist (years, %, scores). Never fabricate new ones.
   - If a bullet has no number, strengthen with truthful scope already implied (domains, tools, activities) — still no invented metrics.

3) STRUCTURE (ATS):
   - Line 1: Name. Line 2: short role tagline from THEIR experience. Then contact (email | phone | location).
   - ALL-CAPS section headers. Every experience/project bullet starts with "- ".
   - Preferred section order: PROFESSIONAL SUMMARY → PROFESSIONAL EXPERIENCE → PROJECTS (optional) → TECHNICAL SKILLS → EDUCATION → LANGUAGES (if present) → INTERESTS/ACHIEVEMENTS (if present).
   - TECHNICAL SKILLS = tools, platforms, testing types, frameworks, programming languages ONLY (e.g. Java, Python, SQL, Selenium, JIRA, Postman).
   - SPOKEN / human languages (English, Hindi, Tamil, Spanish, "Full Professional Proficiency", Native, Fluent, Intermediate) MUST go under a separate ALL-CAPS section named LANGUAGES — NEVER inside TECHNICAL SKILLS.
   - Do NOT name a skills category "Languages" — that confuses spoken languages with programming languages. Use "Programming Languages:" only for code languages.
   - Skills format: "Category: item, item" (e.g. "Testing Types: Manual Testing, Functional Testing"). Keep multi-word phrases intact — never split "Mobile Testing (iOS & Android)" into two items.
   - Deduplicate skills (e.g. Postman only once).
   - Project headings: "Project Name (Domain)" alone on its own line, with the date range on the NEXT line by itself (e.g. "MM/YYYY - MM/YYYY" or "MM/YYYY - Present"). NEVER glue the date range directly onto the title text on the same line (e.g. never "01/2020 - PresentOrder Tracker" — always a line break between them).

4) DEDUPE (critical):
   - Do NOT repeat the same responsibility in both Experience and Projects.
   - Put day-job work under PROFESSIONAL EXPERIENCE under the employer.
   - PROJECTS only for distinct product/project names with 2–4 unique bullets that are NOT copies of Experience.
   - If project = the only place duties lived, move duties under Experience and keep Projects as a short titled stub OR omit Projects.

5) CUT FLUFF:
   - Remove Career Objective / Declaration / "Yours truly" / Date-Place signature blocks.
   - For candidates with a degree AND ~2+ years experience: omit 10th/SSLC and 12th/HSC lines unless they are the only education. Keep bachelor's (and scores if present).
   - Summary: 3–4 high-signal bullets max (never more) — no soft filler ("zeal to learn", "good interpersonal skills") unless nothing else exists.

6) BULLET QUALITY:
   - Tense rule: for the CURRENT / most recent role (the one marked Present or clearly ongoing), present-tense verbs are OK (Build, Automate, Lead, Own…). For every EARLIER / past role, always use past-tense verbs (Built, Automated, Executed, Validated, Integrated…). Never mix — a finished job never gets a present-tense verb.
   - One idea per bullet. 1–2 lines max.
   - Prefer concrete activities from source over vague "responsible for".

7) OUTPUT:
   - Plain text only inside JSON. ASCII. No markdown fences, tables, emoji, or multi-column layouts.`;

/** Spoken / human languages — not technical skills. */
const SPOKEN_LANG_TOKEN =
  /\b(english|hindi|tamil|telugu|kannada|malayalam|marathi|bengali|gujarati|punjabi|urdu|spanish|french|german|arabic|mandarin|chinese|japanese|korean|portuguese|russian|italian)\b/i;

const PROFICIENCY_TOKEN =
  /\b(native|fluent|bilingual|full\s+professional|professional\s+working|limited\s+working|elementary|conversational|mother\s*tongue|proficient)\b/i;

function looksLikeSpokenLanguageLine(line: string): boolean {
  const t = line.replace(/^[-•*]\s*/, '').trim();
  if (!t || t.length > 80) return false;
  if (SPOKEN_LANG_TOKEN.test(t) && (PROFICIENCY_TOKEN.test(t) || /^[A-Za-z]+(\s*\([^)]+\))?$/.test(t))) {
    return true;
  }
  // "English - Full Professional Proficiency"
  if (SPOKEN_LANG_TOKEN.test(t) && /[-–:]/.test(t)) return true;
  return false;
}

function isSectionHeaderLine(line: string): boolean {
  const t = line.trim();
  if (t.length < 3 || t.length > 48) return false;
  return /^[A-Z][A-Z0-9\s/&-]{2,}$/.test(t);
}

/**
 * Pull spoken-language lines out of TECHNICAL SKILLS into a LANGUAGES section.
 * Deterministic safety net when the model (or refine pass) still mixes them.
 */
export function separateLanguagesFromSkills(text: string): string {
  const lines = text.split('\n');
  const pulled: string[] = [];
  const out: string[] = [];
  let inSkills = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (isSectionHeaderLine(trimmed)) {
      inSkills = /^TECHNICAL\s+SKILLS$|^SKILLS$|^CORE\s+COMPETENCIES$/i.test(trimmed);
      out.push(line);
      continue;
    }
    if (inSkills && looksLikeSpokenLanguageLine(trimmed)) {
      pulled.push(trimmed.replace(/^[-•*]\s*/, ''));
      continue;
    }
    // Also strip spoken langs from comma-joined skill category lines
    if (inSkills && /:/.test(trimmed) && SPOKEN_LANG_TOKEN.test(trimmed)) {
      const [label, rest] = trimmed.split(/:(.+)/);
      if (rest) {
        const parts = rest.split(',').map((p) => p.trim()).filter(Boolean);
        const keep: string[] = [];
        for (const p of parts) {
          if (looksLikeSpokenLanguageLine(p) || (SPOKEN_LANG_TOKEN.test(p) && PROFICIENCY_TOKEN.test(p))) {
            pulled.push(p);
          } else {
            keep.push(p);
          }
        }
        if (keep.length === 0) continue;
        out.push(`${label}: ${keep.join(', ')}`);
        continue;
      }
    }
    out.push(line);
  }

  if (pulled.length === 0) return text;

  // Dedupe pulled languages (case-insensitive)
  const seen = new Set<string>();
  const unique = pulled.filter((p) => {
    const key = p.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const joined = out.join('\n');
  if (/^LANGUAGES\s*$/im.test(joined)) {
    return joined.replace(/^(LANGUAGES\s*)$/im, (_, h: string) => {
      return `${h}\n${unique.map((u) => (u.startsWith('-') ? u : `- ${u}`)).join('\n')}`;
    });
  }

  // Insert LANGUAGES after EDUCATION if present, else at end
  const langBlock = `LANGUAGES\n${unique.map((u) => `- ${u}`).join('\n')}`;
  const eduIdx = joined.search(/^EDUCATION\s*$/im);
  if (eduIdx >= 0) {
    const afterEdu = joined.slice(eduIdx);
    const nextHeader = afterEdu.search(/\n[A-Z][A-Z0-9\s/&-]{2,}\s*\n/);
    if (nextHeader > 0) {
      const abs = eduIdx + nextHeader;
      return `${joined.slice(0, abs)}\n\n${langBlock}\n${joined.slice(abs)}`;
    }
  }
  return `${joined.trimEnd()}\n\n${langBlock}`;
}

/** Deduplicate exact skill items inside TECHNICAL SKILLS category lines. */
function dedupeSkillItems(text: string): string {
  const lines = text.split('\n');
  let inSkills = false;
  return lines
    .map((line) => {
      const trimmed = line.trim();
      if (isSectionHeaderLine(trimmed)) {
        inSkills = /^TECHNICAL\s+SKILLS$|^SKILLS$|^CORE\s+COMPETENCIES$/i.test(trimmed);
        return line;
      }
      if (!inSkills || !/:/.test(trimmed)) return line;
      const idx = trimmed.indexOf(':');
      const label = trimmed.slice(0, idx);
      const rest = trimmed.slice(idx + 1);
      const seen = new Set<string>();
      const parts = rest
        .split(',')
        .map((p) => p.trim())
        .filter(Boolean)
        .filter((p) => {
          const k = p.toLowerCase();
          if (seen.has(k)) return false;
          seen.add(k);
          return true;
        });
      return `${label}: ${parts.join(', ')}`;
    })
    .join('\n');
}

/**
 * Cleans up mechanical text issues the LLM sometimes leaves behind
 * (glued date+title lines, languages-in-skills, excess blank lines).
 */
export function postProcessUpgradedResume(text: string): string {
  let out = text.replace(
    /^(\d{1,2}\/\d{4}\s*[-–]\s*(?:Present|\d{1,2}\/\d{4}))([A-Za-z])/gim,
    '$1 $2',
  );
  out = separateLanguagesFromSkills(out);
  out = dedupeSkillItems(out);
  out = out.replace(/\n{3,}/g, '\n\n');
  out = out
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/g, ''))
    .join('\n');
  return out.trim();
}

async function parseResumeJson(raw: string): Promise<string> {
  let parsed: { resume?: string };
  try {
    parsed = JSON.parse(raw) as { resume?: string };
  } catch {
    throw new Error('Model returned invalid JSON for resume upgrade.');
  }
  const upgraded = postProcessUpgradedResume(parsed.resume ?? '');
  if (upgraded.length < 80) {
    throw new Error('Upgrade produced an empty or too-short resume.');
  }
  return upgraded;
}

/** Second pass: fact-check + dedupe against source (medium/deep). */
async function refineUpgrade(args: {
  source: string;
  draft: string;
  profileId?: string;
}): Promise<string> {
  const system = `You are Hyred Resume QA. Return JSON only: { "resume": "<corrected full resume>" }

Fix the DRAFT against the SOURCE using this checklist:
- Remove any invented metrics, tools, employers, or locations not in SOURCE.
- Fix employer lines that wrongly use personal city as company city.
- Replace assumed "Present" with source date wording if source never says present/current.
- Deduplicate Experience vs Projects (no repeated bullets).
- Restore important domain/tool keywords from SOURCE that the draft dropped.
- Drop SSLC/HSC if a bachelor's + experience exists.
- CRITICAL: Move any spoken/human languages (English, Hindi, proficiency lines) OUT of TECHNICAL SKILLS into a LANGUAGES section. TECHNICAL SKILLS is only tools/testing/programming.
- Fix split phrases (e.g. "Mobile Testing (iOS" + "Android)" must be one skill: "Mobile Testing (iOS & Android)").
- Deduplicate repeated skill items (e.g. Postman twice).
- Keep ATS plain-text format (name, tagline, contact, ALL-CAPS headers, "- " bullets).
- Do not invent new content. Prefer SOURCE truth over DRAFT flair.
${QUALITY_BAR}`;

  const user = `SOURCE RESUME:
"""
${args.source.slice(0, 12000)}
"""

DRAFT UPGRADE (to correct):
"""
${args.draft.slice(0, 12000)}
"""

Return the corrected full resume JSON.`;

  const raw = await chat(system, user, 0.2, true, 'ats_upgrade_refine', args.profileId);
  return parseResumeJson(raw);
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

  const system = `You are Hyred Resume Upgrade — elite ATS editor for Indian and global tech hiring.
Return JSON only: { "resume": "<full upgraded plain-text resume>" }

${QUALITY_BAR}

${intensityInstructions(plan.intensity)}`;

  const user = `CURRENT ATS SCORE: ${args.result.overallScore}/100
UPGRADE MODE: ${plan.label} (${plan.intensity})

WEAK AREAS FROM CHECKER:
${weakFeedback || '- None flagged — still apply QUALITY BAR polish.'}
${jdBlock}
SOURCE RESUME:
"""
${args.resumeText.slice(0, 14000)}
"""

Produce a 9.5/10 upgraded resume: ATS-perfect structure, zero invented facts, zero fluff, zero duplicate bullets, keep all real domains/tools/employers.`;

  const raw = await chat(system, user, 0.3, true, 'ats_upgrade', args.profileId);
  let upgraded = await parseResumeJson(raw);

  // Always run QA refine when we can — catches skills/languages mixups etc.
  // Skip only if the first pass already failed to produce usable text.
  try {
    upgraded = await refineUpgrade({
      source: args.resumeText,
      draft: upgraded,
      profileId: args.profileId,
    });
  } catch (e) {
    console.warn('[ats_upgrade_refine] skipped', e);
  }

  // Deterministic structure fix after refine (languages out of skills, dedupe)
  upgraded = postProcessUpgradedResume(upgraded);

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
