/**
 * One-click ATS resume upgrade — score decides how hard the AI works.
 * Pure helpers (client-safe). LLM call lives in ats-upgrade-ai.ts.
 */

import type { AtsCheckResult } from './ats-checker';

export type AtsUpgradeIntensity = 'light' | 'medium' | 'deep';

export interface AtsUpgradePlan {
  intensity: AtsUpgradeIntensity;
  /** Resume Studio credits this upgrade consumes */
  creditCost: number;
  label: string;
  summary: string;
  /** Bullet list shown in the UI before the user clicks Upgrade */
  willDo: string[];
}

/**
 * Map overall ATS score → how much AI rewriting is needed.
 * Good score = light polish. Weak score = deeper rewrite.
 */
export function planAtsUpgrade(result: AtsCheckResult): AtsUpgradePlan {
  const score = result.overallScore;
  const weak = Object.entries(result.breakdown)
    .filter(([, c]) => c.score < 75)
    .map(([k]) => k);

  if (score >= 75) {
    return {
      intensity: 'light',
      creditCost: 1,
      label: 'Light polish',
      summary: `Your score is ${score}/100 — solid base. AI will do a light cleanup only.`,
      willDo: [
        'Keep every employer, tool, and date exactly as in your resume',
        'Remove fluff (objectives/declarations) and tighten bullets',
        'Deduplicate Experience vs Projects',
        'ATS-safe format — no invented metrics or locations',
      ],
    };
  }

  if (score >= 50) {
    return {
      intensity: 'medium',
      creditCost: 1,
      label: 'Focused upgrade',
      summary: `Your score is ${score}/100 — AI will strengthen the weak areas (${weak.length} criteria below the bar), then fact-check the result.`,
      willDo: [
        'Rebuild into a clear ATS layout (Summary → Skills → Experience → Education)',
        'Move project duties under the real employer; no duplicate bullets',
        'Keep domains/tools from your resume; never invent metrics',
        'Second AI pass: fact-check dates, locations, and dropped keywords',
      ],
    };
  }

  return {
    intensity: 'deep',
    creditCost: 2,
    label: 'Full ATS rebuild',
    summary: `Your score is ${score}/100 — AI will rebuild for ATS, then run a quality/fact-check pass (aiming for a 9.5-level edit).`,
    willDo: [
      'Full ATS rebuild from your facts only (no invented employers/metrics)',
      'Strong experience bullets; drop school boards if you already have a degree + experience',
      'Keep real domains (e.g. e-commerce/travel) and all tools you listed',
      'Second AI pass: truth lock + dedupe + restore any dropped signal',
    ],
  };
}
