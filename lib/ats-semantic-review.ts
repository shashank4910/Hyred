/**
 * Layer B — LLM semantic ATS review with exact-quote grounding.
 * Replaces brittle spelling / skill / vague dictionaries.
 */

import { chat } from './gemini';
import type { AtsReportCheck, AtsReportCheckStatus } from './ats-report';
import { resumeContainsEvidence } from './ats-resume-parse';

export interface SemanticReviewOptions {
  jobDescription?: string;
  profileId?: string;
  /** Injected for tests — skip live LLM */
  chatFn?: typeof chat;
}

interface LlmCheckPayload {
  id: string;
  label: string;
  status: 'pass' | 'warn' | 'fail';
  summary?: string;
  detail: string;
  education?: string;
  evidence?: string[];
  suggestions?: Array<{ found: string; suggestion: string }>;
  repetitions?: Array<{ word: string; count: number; suggestions?: string[] }>;
  skills_found?: string[];
  /** Exact heading text mapped to a canonical ATS section */
  sections_mapped?: Array<{ canonical: string; heading: string }>;
}

interface LlmPayload {
  checks?: LlmCheckPayload[];
}

const ALLOWED_CANONICAL = new Set([
  'Experience',
  'Education',
  'Skills',
  'Summary',
  'Projects',
  'Certifications',
]);

const ALLOWED_IDS = new Set([
  'semantic-spelling',
  'semantic-skills',
  'semantic-impact',
  'semantic-repetition',
  'semantic-vague',
  'semantic-template',
  'semantic-truncated',
  'semantic-verbs',
  'semantic-jd',
  'semantic-sections',
]);

const LABEL_FALLBACK: Record<string, string> = {
  'semantic-spelling': 'Spelling & Grammar',
  'semantic-skills': 'Skills Optimization',
  'semantic-impact': 'Quantifying Impact',
  'semantic-repetition': 'Repetition',
  'semantic-vague': 'Vague Language',
  'semantic-template': 'Template Junk',
  'semantic-truncated': 'Truncated Lines',
  'semantic-verbs': 'Action Verbs',
  'semantic-jd': 'Hard Skills (JD)',
  'semantic-sections': 'Essential Sections',
};

function scoreForStatus(status: AtsReportCheckStatus): number {
  if (status === 'pass') return 88;
  if (status === 'warn') return 58;
  if (status === 'fail') return 28;
  return 0;
}

function weaknessFor(id: string): string | undefined {
  if (id === 'semantic-impact') return 'quantifiableAchievements';
  if (id === 'semantic-skills') return 'skillsOptimization';
  if (id === 'semantic-sections') return 'sectionStructure';
  if (id === 'semantic-spelling' || id === 'semantic-repetition' || id === 'semantic-vague')
    return 'bulletQuality';
  return undefined;
}

function criterionFor(
  id: string,
): AtsReportCheck['criterionKey'] {
  if (id === 'semantic-impact') return 'quantifiableAchievements';
  if (id === 'semantic-skills') return 'skillsOptimization';
  if (id === 'semantic-jd') return 'jdKeywords';
  if (id === 'semantic-sections') return 'sectionStructure';
  if (
    id === 'semantic-spelling' ||
    id === 'semantic-repetition' ||
    id === 'semantic-vague' ||
    id === 'semantic-verbs' ||
    id === 'semantic-template' ||
    id === 'semantic-truncated'
  )
    return 'bulletQuality';
  return 'premium';
}

function buildSystemPrompt(): string {
  return `You are an ATS resume auditor. Return ONLY valid JSON (no markdown).

Analyze the resume for MEANING issues only. Do not invent text.

Required JSON shape:
{
  "checks": [
    {
      "id": "semantic-spelling|semantic-skills|semantic-impact|semantic-repetition|semantic-vague|semantic-template|semantic-truncated|semantic-verbs|semantic-jd|semantic-sections",
      "label": "short label",
      "status": "pass|warn|fail",
      "summary": "e.g. 3 issues",
      "detail": "1-2 sentences, concrete",
      "education": "why this matters (1 sentence)",
      "evidence": ["EXACT substring copied from the resume"],
      "suggestions": [{"found":"typo","suggestion":"fix"}],
      "repetitions": [{"word":"involved","count":12,"suggestions":["executed","owned"]}],
      "skills_found": ["JIRA","Postman"],
      "sections_mapped": [{"canonical":"Experience","heading":"Accenture Experience"}]
    }
  ]
}

Rules:
1. Every fail/warn MUST include evidence[] with EXACT quotes copied from the resume (character-accurate). If you cannot quote it, use status pass or omit the check. Exception: semantic-sections may fail on missing required sections without quotes.
2. semantic-spelling: real typos/misspellings only (e.g. Regresion, methodlogy, Backened). Ignore proper nouns.
3. semantic-skills: list skills_found from the resume. pass if 6+ real skills/tools; warn if 3-5; fail if under 3. Never say "only 2 skills" if more appear in evidence/skills_found.
4. semantic-impact: fail/warn when experience lines lack numbers/metrics; quote those lines.
5. semantic-repetition: overused verbs/phrases (e.g. "involved" 8+ times) OR near-duplicate paragraphs copied across sections.
6. semantic-vague: duty filler ("involved in", "responsible for") without outcomes.
7. semantic-template: leftover template labels (Achievements/Tasks, empty Courses).
8. semantic-truncated: cut-off titles/words (e.g. "Associate Quality Anal").
9. semantic-verbs: weak/missing action verbs at start of duties.
10. semantic-jd: only if a job description is provided — missing hard skills.
11. semantic-sections (ALWAYS include): map odd/misspelled headings to canonical ATS sections. canonical must be one of Experience|Education|Skills|Summary|Projects|Certifications. heading MUST be an EXACT short heading line copied from the resume (e.g. "Accenture Experience", "PROFFESSINAL SUMMARY", "Area of expertise", "TCS EXPERINECE"). Do NOT invent headings. Required: Experience, Education, Skills. Summary is optional. status fail if any required is missing; warn if only Summary missing; pass if Experience+Education+Skills found. Put mapped headings in sections_mapped; list missing required names in detail.
12. Keep checks array to at most 10 items. Prefer fail/warn with evidence over vague passes.
13. Write simple English. No markdown fences.`;
}

function buildUserPrompt(resumeText: string, jobDescription?: string): string {
  const clipped = resumeText.length > 12000 ? `${resumeText.slice(0, 12000)}\n…` : resumeText;
  let prompt = `RESUME TEXT:\n"""\n${clipped}\n"""\n`;
  if (jobDescription?.trim()) {
    const jd =
      jobDescription.length > 4000
        ? `${jobDescription.slice(0, 4000)}\n…`
        : jobDescription;
    prompt += `\nJOB DESCRIPTION:\n"""\n${jd}\n"""\n`;
  } else {
    prompt += `\n(No job description provided — omit semantic-jd entirely. Do not invent a pass for it.)\n`;
  }
  prompt += `\nReturn the JSON object now.`;
  return prompt;
}

const REQUIRED_SECTION_LABELS = ['Experience', 'Education', 'Skills'] as const;

/**
 * Build Essential Sections from LLM heading map — only keep headings that
 * appear verbatim in the resume. Status is recomputed from grounded map.
 */
function groundSemanticSections(
  raw: LlmCheckPayload,
  resumeText: string,
): AtsReportCheck {
  const mapped = new Map<string, string>();
  for (const row of raw.sections_mapped ?? []) {
    const canonical = String(row?.canonical || '').trim();
    const heading = String(row?.heading || '').trim();
    if (!ALLOWED_CANONICAL.has(canonical) || heading.length < 3) continue;
    if (!resumeContainsEvidence(resumeText, heading)) continue;
    // Prefer first grounded heading per canonical
    if (!mapped.has(canonical)) mapped.set(canonical, heading);
  }

  const foundItems = [
    ...REQUIRED_SECTION_LABELS.map((label) => ({
      label,
      ok: mapped.has(label),
      value: mapped.get(label),
    })),
    {
      label: 'Summary',
      ok: mapped.has('Summary'),
      value: mapped.get('Summary'),
    },
  ];
  for (const label of ['Projects', 'Certifications'] as const) {
    if (mapped.has(label)) {
      foundItems.push({ label, ok: true, value: mapped.get(label) });
    }
  }

  const missingRequired = REQUIRED_SECTION_LABELS.filter((l) => !mapped.has(l));
  const missingSummary = !mapped.has('Summary');
  let finalStatus: AtsReportCheckStatus = 'pass';
  let score = 100;
  if (missingRequired.length > 0) {
    finalStatus = 'fail';
    score = Math.max(20, 100 - missingRequired.length * 30);
  } else if (missingSummary) {
    finalStatus = 'warn';
    score = 70;
  }

  const issueN =
    missingRequired.length > 0
      ? missingRequired.length
      : missingSummary
        ? 1
        : 0;

  const foundNames = [...mapped.entries()].map(([c, h]) => `${c} (“${h}”)`);
  const detail =
    missingRequired.length > 0
      ? `Missing required sections: ${missingRequired.join(', ')}.${
          foundNames.length ? ` Found: ${foundNames.join(', ')}.` : ''
        }`
      : missingSummary
        ? `Found Experience, Education, and Skills. No Summary / Profile heading — optional but helps ATS.`
        : `We mapped your headings: ${foundNames.join(', ')}.`;

  const quotes = [...mapped.values()].slice(0, 4).map((text) => ({ text }));

  return {
    id: 'semantic-sections',
    weaknessId: 'sectionStructure',
    criterionKey: 'sectionStructure',
    label: raw.label?.trim() || LABEL_FALLBACK['semantic-sections'],
    status: finalStatus,
    score,
    summary:
      finalStatus === 'pass'
        ? 'No issues'
        : `${issueN} issue${issueN === 1 ? '' : 's'}`,
    detail,
    education:
      raw.education?.trim() ||
      'ATS systems map your resume into standard sections. Odd or misspelled headings are fine if we can still recognize them.',
    passText: detail,
    foundItems,
    quotes,
  };
}

function groundCheck(
  raw: LlmCheckPayload,
  resumeText: string,
  opts: { hasJd?: boolean } = {},
): AtsReportCheck | null {
  if (!ALLOWED_IDS.has(raw.id)) return null;
  // Never invent a green JD check when the user did not paste a job description
  if (raw.id === 'semantic-jd' && !opts.hasJd) return null;
  const status = raw.status;
  if (status !== 'pass' && status !== 'warn' && status !== 'fail') return null;

  // Section mapping — always rebuild from grounded headings (ignore model status)
  if (raw.id === 'semantic-sections') {
    return groundSemanticSections(raw, resumeText);
  }

  const evidence = (raw.evidence ?? [])
    .map((e) => String(e || '').trim())
    .filter((e) => e.length >= 3 && resumeContainsEvidence(resumeText, e))
    .slice(0, 4);

  const suggestions = (raw.suggestions ?? [])
    .filter(
      (s) =>
        s?.found &&
        s?.suggestion &&
        resumeContainsEvidence(resumeText, String(s.found)),
    )
    .slice(0, 8)
    .map((s) => ({ found: String(s.found), suggestion: String(s.suggestion) }));

  const repetitions = (raw.repetitions ?? [])
    .filter(
      (r) =>
        r?.word &&
        typeof r.count === 'number' &&
        r.count >= 2 &&
        resumeContainsEvidence(resumeText, String(r.word)),
    )
    .slice(0, 5)
    .map((r) => ({
      word: String(r.word).toLowerCase(),
      count: Math.round(r.count),
      suggestions: (r.suggestions ?? []).map(String).slice(0, 4),
    }));

  // Fail/warn without any grounded proof → drop
  if (status !== 'pass') {
    const hasProof =
      evidence.length > 0 || suggestions.length > 0 || repetitions.length > 0;
    if (raw.id === 'semantic-skills') {
      // allow warn/fail if skills_found is small even without quotes
      const found = (raw.skills_found ?? []).map(String).filter(Boolean);
      if (!hasProof && found.length === 0 && status === 'fail') {
        // absence of skills — allowed
      } else if (!hasProof && found.length > 0) {
        // model said warn but listed skills — prefer pass if many skills
        if (found.length >= 6) {
          return {
            id: raw.id,
            weaknessId: weaknessFor(raw.id),
            criterionKey: criterionFor(raw.id),
            label: raw.label || LABEL_FALLBACK[raw.id],
            status: 'pass',
            score: 88,
            summary: 'No issues',
            detail: `Skills detected include: ${found.slice(0, 10).join(', ')}.`,
            education: raw.education,
            passText: `Found ${found.length} skills/tools in your resume.`,
            foundItems: found.slice(0, 12).map((s) => ({ label: s, ok: true })),
          };
        }
      }
    } else if (!hasProof && raw.id !== 'semantic-jd') {
      return null;
    }
  }

  const skillsFound = (raw.skills_found ?? []).map(String).filter(Boolean).slice(0, 16);

  // Override false "few skills" when skills_found is rich
  let finalStatus = status;
  let detail = (raw.detail || '').trim() || LABEL_FALLBACK[raw.id];
  if (raw.id === 'semantic-skills' && skillsFound.length >= 6 && status !== 'pass') {
    finalStatus = 'pass';
    detail = `Skills detected include: ${skillsFound.slice(0, 10).join(', ')}.`;
  }

  const check: AtsReportCheck = {
    id: raw.id,
    weaknessId: weaknessFor(raw.id),
    criterionKey: criterionFor(raw.id),
    label: raw.label?.trim() || LABEL_FALLBACK[raw.id],
    status: finalStatus,
    score: scoreForStatus(finalStatus),
    summary:
      raw.summary?.trim() ||
      (finalStatus === 'pass'
        ? 'No issues'
        : `${Math.max(1, evidence.length || suggestions.length || repetitions.length)} issue${
            (evidence.length || suggestions.length || repetitions.length) === 1 ? '' : 's'
          }`),
    detail,
    education: raw.education?.trim(),
    passText: finalStatus === 'pass' ? detail : undefined,
    quotes: finalStatus === 'pass' ? [] : evidence.map((t) => ({ text: t })),
    suggestions: finalStatus === 'pass' ? [] : suggestions,
    repetitions: finalStatus === 'pass' ? [] : repetitions,
  };

  if (raw.id === 'semantic-skills' && skillsFound.length > 0) {
    check.foundItems = skillsFound.map((s) => ({ label: s, ok: true }));
  }

  return check;
}

function extractJson(text: string): LlmPayload | null {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed) as LlmPayload;
  } catch {
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(trimmed.slice(start, end + 1)) as LlmPayload;
      } catch {
        return null;
      }
    }
    return null;
  }
}

/**
 * Run semantic LLM review. On failure returns [] (facts-only report still works).
 */
export async function runSemanticReview(
  resumeText: string,
  opts: SemanticReviewOptions = {},
): Promise<AtsReportCheck[]> {
  const chatFn = opts.chatFn ?? chat;
  try {
    const raw = await chatFn(
      buildSystemPrompt(),
      buildUserPrompt(resumeText, opts.jobDescription),
      0.1,
      true,
      'ats_semantic_review',
      opts.profileId,
    );
    const parsed = extractJson(raw);
    if (!parsed?.checks || !Array.isArray(parsed.checks)) return [];

    const grounded: AtsReportCheck[] = [];
    const seen = new Set<string>();
    for (const item of parsed.checks) {
      if (!item?.id || seen.has(item.id)) continue;
      const check = groundCheck(item, resumeText, {
        hasJd: Boolean(opts.jobDescription?.trim()),
      });
      if (!check) continue;
      seen.add(check.id);
      grounded.push(check);
    }
    return grounded;
  } catch (e) {
    console.warn('[ats-semantic-review] failed:', (e as Error).message);
    return [];
  }
}
