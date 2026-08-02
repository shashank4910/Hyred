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
        'Keep your facts, roles, and dates exactly as they are',
        'Tighten wording and bullet consistency',
        'Fix format / section header clarity for ATS parsers',
        'No big rewrite — minimal changes',
      ],
    };
  }

  if (score >= 50) {
    return {
      intensity: 'medium',
      creditCost: 1,
      label: 'Focused upgrade',
      summary: `Your score is ${score}/100 — AI will strengthen the weak areas (${weak.length} criteria below the bar).`,
      willDo: [
        'Rebuild structure into a clear ATS-friendly layout',
        'Strengthen bullets and skills wording (truth only)',
        'Improve weak sections without inventing employers or metrics',
        'Preserve contact info, employers, titles, and dates',
      ],
    };
  }

  return {
    intensity: 'deep',
    creditCost: 2,
    label: 'Full ATS rebuild',
    summary: `Your score is ${score}/100 — AI will do a deeper rebuild so the resume is ATS-ready.`,
    willDo: [
      'Full ATS structure: Summary, Skills, Experience, Education',
      'Rewrite bullets for clarity and impact (no invented numbers)',
      'Normalize dates, contact block, and section headers',
      'Keep every employer, title, and degree you already have',
    ],
  };
}
