import { llmJsonChat } from '@/lib/gemini';
import type { MatchIntelligenceResult } from '@/lib/types';

export function normalizeVerdictResult(input: {
  verdict?: string;
  seniorityFit?: string;
  reasons?: string[];
  actions?: string[];
}): MatchIntelligenceResult {
  const verdict =
    input.verdict === 'apply' || input.verdict === 'skip' ? input.verdict : 'stretch';
  const seniorityFit =
    input.seniorityFit === 'underqualified' || input.seniorityFit === 'overqualified'
      ? input.seniorityFit
      : 'calibrated';

  return {
    verdict,
    seniorityFit,
    reasons: Array.isArray(input.reasons) ? input.reasons.slice(0, 3) : [],
    actions: Array.isArray(input.actions) ? input.actions.slice(0, 3) : [],
  };
}

export async function generateMatchIntelligence(args: {
  score: number | null;
  matchedSkills: string[];
  missingSkills: string[];
  yearsExperience: number | null;
  seniority: string | null;
  jobTitle: string;
  jobDescription: string;
  reason: string | null;
  profileId?: string;
}): Promise<MatchIntelligenceResult> {
  const system = `You are Hyred's job match strategist.
Return compact JSON with:
{
  "verdict": "apply" | "stretch" | "skip",
  "seniorityFit": "underqualified" | "calibrated" | "overqualified",
  "reasons": ["...", "...", "..."],
  "actions": ["...", "...", "..."]
}
Use only evidence from the supplied match context. Never claim interview probability.`;

  const { profileId, ...context } = args;
  const raw = await llmJsonChat(system, JSON.stringify(context), 0.2, profileId);
  const parsed = JSON.parse(raw);
  return normalizeVerdictResult(parsed);
}
