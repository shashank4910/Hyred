/**
 * LLM-powered ATS fix suggestions (patch-level, truth-preserving).
 */

import { chat } from './gemini';
import { sanitizeJobDescriptionForAI } from './jd-fetcher';
import {
  ATS_CRITERION_LABELS,
  findSnippetRange,
  makeSuggestionId,
  type AtsCriterionKey,
  type AtsFixSuggestion,
  type AtsFixWeaknessId,
} from './ats-fix';

export interface SuggestAtsFixesArgs {
  resumeText: string;
  weaknessId: AtsFixWeaknessId;
  criterionKey: AtsCriterionKey | 'jdKeywords';
  feedback: string;
  missingKeyword?: string;
  jobDescription?: string;
  /** Prior proposed texts to avoid on regenerate */
  avoidProposed?: string[];
  profileId?: string;
}

interface RawSuggestion {
  title?: string;
  rationale?: string;
  originalSnippet?: string;
  proposedText?: string;
}

export async function suggestAtsFixes(args: SuggestAtsFixesArgs): Promise<AtsFixSuggestion[]> {
  const label =
    args.criterionKey === 'jdKeywords'
      ? `Missing JD keyword: ${args.missingKeyword ?? ''}`
      : ATS_CRITERION_LABELS[args.criterionKey];

  const jdBlock = args.jobDescription
    ? `\nJOB DESCRIPTION (context only):\n${sanitizeJobDescriptionForAI(args.jobDescription).slice(0, 2500)}\n`
    : '';

  const avoidBlock =
    args.avoidProposed && args.avoidProposed.length > 0
      ? `\nDo NOT reuse these previous proposals:\n${args.avoidProposed.map((t) => `- ${t}`).join('\n')}\n`
      : '';

  const keywordRule = args.missingKeyword
    ? `Weave the keyword "${args.missingKeyword}" into an EXISTING bullet or skills line only if the candidate's experience already supports it. If it cannot be honestly added, return an empty suggestions array.`
    : '';

  const system = `You are Hyred Fix Studio, an ATS resume editor.
Return JSON only: { "suggestions": [ { "title", "rationale", "originalSnippet", "proposedText" } ] }

Rules:
- Propose 1–3 small patches (prefer 1–2). Never rewrite the whole resume.
- originalSnippet MUST be copied EXACTLY from the resume (character-accurate), usually one bullet or one short line.
- proposedText replaces ONLY that snippet. Keep similar length.
- NEVER invent employers, job titles, dates, degrees, or tools the resume does not support.
- Prefer stronger verbs and real metrics already implied by the text; do not fabricate numbers.
- Keep plain text (no markdown). Preserve leading "- " on bullets when present.
- ${keywordRule || 'Focus on the stated weakness only.'}`;

  const user = `WEAKNESS: ${label}
FEEDBACK: ${args.feedback}
${jdBlock}${avoidBlock}
RESUME:
"""
${args.resumeText.slice(0, 12000)}
"""

Return JSON with suggestions that fix this weakness.`;

  const raw = await chat(system, user, 0.35, true, 'ats_fix_suggest', args.profileId);
  let parsed: { suggestions?: RawSuggestion[] };
  try {
    parsed = JSON.parse(raw) as { suggestions?: RawSuggestion[] };
  } catch {
    throw new Error('Model returned invalid JSON for ATS fixes.');
  }

  const out: AtsFixSuggestion[] = [];
  for (const s of parsed.suggestions ?? []) {
    const originalSnippet = (s.originalSnippet ?? '').trim();
    const proposedText = (s.proposedText ?? '').trim();
    if (!originalSnippet || !proposedText) continue;
    if (originalSnippet === proposedText) continue;
    if (!findSnippetRange(args.resumeText, originalSnippet)) continue;
    // Guard against huge swaps
    if (proposedText.length > originalSnippet.length * 4 + 200) continue;

    out.push({
      id: makeSuggestionId(args.weaknessId, originalSnippet + proposedText),
      weaknessId: args.weaknessId,
      criterionKey: args.criterionKey,
      title: (s.title ?? 'Suggested rewrite').trim().slice(0, 120),
      rationale: (s.rationale ?? '').trim().slice(0, 400),
      originalSnippet,
      proposedText,
    });
    if (out.length >= 3) break;
  }

  return out;
}
