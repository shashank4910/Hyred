/**
 * LLM-powered ATS fix suggestions (patch-level, truth-preserving).
 */

import { chat } from './gemini';
import { sanitizeJobDescriptionForAI } from './jd-fetcher';
import { findUnquantifiedBullets, findThinBullets } from './ats-report';
import {
  ATS_CRITERION_LABELS,
  findSnippetRange,
  makeSuggestionId,
  sameOrOverlappingLine,
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
  /** Original snippets already fixed — never retarget these lines */
  avoidOriginals?: string[];
  profileId?: string;
}

interface RawSuggestion {
  title?: string;
  rationale?: string;
  originalSnippet?: string;
  proposedText?: string;
}

function extractNumberTokens(text: string): string[] {
  const matches = text.match(/\d[\d,]*(?:\.\d+)?%?|\d+m\+?|\d+k\+?/gi) ?? [];
  return matches.map((m) => m.toLowerCase().replace(/,/g, ''));
}

/** Reject proposals that invent new number tokens not present in the original snippet. */
function inventsNumbers(original: string, proposed: string): boolean {
  const before = new Set(extractNumberTokens(original));
  for (const tok of extractNumberTokens(proposed)) {
    if (!before.has(tok)) {
      // Allow expanding "2M" ↔ "2 million" style only when a related token exists
      const digits = tok.replace(/[^\d.]/g, '');
      const related = [...before].some((b) => b.replace(/[^\d.]/g, '') === digits);
      if (!related) return true;
    }
  }
  return false;
}

function alreadyHasMetric(text: string): boolean {
  const body = text.replace(/^\s*[-•*→\d.)]+\s*/, '');
  if (!/\d/.test(body)) return false;
  // Date-only years don't count as impact metrics
  const withoutYears = body.replace(/\b(19|20)\d{2}\b/g, '');
  return /\d/.test(withoutYears) || /%|\$/.test(body);
}

function criterionGuidance(
  criterionKey: AtsCriterionKey | 'jdKeywords',
  resumeText: string,
  missingKeyword?: string,
): string {
  if (criterionKey === 'quantifiableAchievements') {
    const targets = findUnquantifiedBullets(resumeText, 5);
    const targetBlock =
      targets.length > 0
        ? `ONLY rewrite one of these bullets that lack metrics:\n${targets.map((t) => `- ${t}`).join('\n')}`
        : 'Only rewrite bullets that currently have NO numbers, %, or $ amounts.';
    return `WEAKNESS FOCUS — Quantified Impact:
- ${targetBlock}
- Do NOT rewrite bullets that already contain metrics (numbers, %, $, "2M+", "users", headcount, etc.).
- Do NOT invent role-specific metrics (user counts, TPS, revenue, latency) unless that exact number already appears in THAT bullet.
- Prefer clearer verbs and structure on unquantified bullets. If you cannot improve without inventing numbers, return {"suggestions":[]}.`;
  }

  if (criterionKey === 'bulletQuality') {
    const thin = findThinBullets(resumeText, 5);
    const thinBlock =
      thin.length > 0
        ? `Prefer these thin bullets:\n${thin.map((t) => `- ${t}`).join('\n')}`
        : 'Expand thin or inconsistent bullets only.';
    return `WEAKNESS FOCUS — Bullet quality:\n- ${thinBlock}\n- Do not invent metrics.`;
  }

  if (criterionKey === 'jdKeywords' && missingKeyword) {
    return `WEAKNESS FOCUS — Missing keyword "${missingKeyword}":
- Weave it into an EXISTING bullet or skills line only if the candidate's experience already supports it.
- If it cannot be honestly added, return {"suggestions":[]}.
- Do NOT invent employers, tools, or metrics.`;
  }

  return 'Focus on the stated weakness only. Never invent metrics, tools, employers, or titles.';
}

export async function suggestAtsFixes(args: SuggestAtsFixesArgs): Promise<AtsFixSuggestion[]> {
  const label =
    args.criterionKey === 'jdKeywords'
      ? `Missing JD keyword: ${args.missingKeyword ?? ''}`
      : ATS_CRITERION_LABELS[args.criterionKey];

  const jdBlock = args.jobDescription
    ? `\nJOB DESCRIPTION (context only):\n${sanitizeJobDescriptionForAI(args.jobDescription).slice(0, 2500)}\n`
    : '';

  const avoidProposed = (args.avoidProposed ?? []).filter(Boolean).slice(0, 10);
  const avoidOriginals = (args.avoidOriginals ?? []).filter(Boolean).slice(0, 10);

  const avoidBlock =
    avoidProposed.length || avoidOriginals.length
      ? `\nALREADY HANDLED — do not retarget or reuse:
${avoidOriginals.map((t) => `- original: ${t}`).join('\n')}
${avoidProposed.map((t) => `- proposed: ${t}`).join('\n')}
Pick a DIFFERENT resume line if you suggest anything.\n`
      : '';

  const guidance = criterionGuidance(args.criterionKey, args.resumeText, args.missingKeyword);

  const system = `You are Hyred Fix Studio, an ATS resume editor.
Return JSON only: { "suggestions": [ { "title", "rationale", "originalSnippet", "proposedText" } ] }

Rules:
- Propose 1–2 small patches. Never rewrite the whole resume.
- originalSnippet MUST be copied EXACTLY from the resume (character-accurate), usually one bullet or one short line.
- proposedText replaces ONLY that snippet. Keep similar length.
- NEVER invent employers, job titles, dates, degrees, tools, user counts, revenue, or other metrics the resume does not already state in that same line.
- Do not fabricate numbers. Do not add "users", "customers", "$", or "%" unless that number already exists in the originalSnippet.
- Keep plain text (no markdown). Preserve leading "- " on bullets when present.
- Prefer a different bullet than ones already handled.
- ${guidance}`;

  const user = `WEAKNESS: ${label}
FEEDBACK: ${args.feedback}
${jdBlock}${avoidBlock}
RESUME:
"""
${args.resumeText.slice(0, 12000)}
"""

Return JSON with suggestions that fix this weakness. If nothing safe remains, return {"suggestions":[]}.`;

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
    if (proposedText.length > originalSnippet.length * 4 + 200) continue;

    // Hard reject: already-applied / already-avoided lines (LLM often ignores soft avoid)
    const blocked = [...avoidOriginals, ...avoidProposed].some(
      (a) =>
        sameOrOverlappingLine(a, originalSnippet) || sameOrOverlappingLine(a, proposedText),
    );
    if (blocked) continue;

    // Hard reject near-duplicate of another suggestion in this batch
    if (
      out.some(
        (o) =>
          sameOrOverlappingLine(o.originalSnippet, originalSnippet) ||
          sameOrOverlappingLine(o.proposedText, proposedText),
      )
    ) {
      continue;
    }

    // Quantifying Impact: never polish bullets that already have metrics
    if (args.criterionKey === 'quantifiableAchievements' && alreadyHasMetric(originalSnippet)) {
      continue;
    }

    // Never invent new number tokens
    if (inventsNumbers(originalSnippet, proposedText)) continue;

    out.push({
      id: makeSuggestionId(args.weaknessId, originalSnippet + proposedText),
      weaknessId: args.weaknessId,
      criterionKey: args.criterionKey,
      title: (s.title ?? 'Suggested rewrite').trim().slice(0, 120),
      rationale: (s.rationale ?? '').trim().slice(0, 400),
      originalSnippet,
      proposedText,
    });
    if (out.length >= 2) break;
  }

  return out;
}
