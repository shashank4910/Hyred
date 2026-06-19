import type { SupabaseClient } from '@supabase/supabase-js';
import { extractStructuredApplicationProfile } from '@/lib/gemini';
import {
  normalizeEducationHistory,
  normalizeWorkHistory,
  type StructuredEducationEntry,
  type StructuredWorkEntry,
  type StructureSource,
} from '@/lib/extension/structured-profile';

export type StructureSaveResult = {
  work_history: StructuredWorkEntry[];
  education: StructuredEducationEntry[];
  source: StructureSource;
  warnings: string[];
};

const AI_ONLY_WARNING =
  'Work history requires AI extraction — open Extension Profile and tap Refresh from resume.';

/** AI-only extraction — no regex fallback (regex produced bad job rows on real resumes). */
export async function extractStructuredFromResume(
  resumeText: string,
): Promise<StructureSaveResult> {
  if (!resumeText || resumeText.length < 80) {
    return {
      work_history: [],
      education: [],
      source: 'ai',
      warnings: ['Resume too short for AI extraction'],
    };
  }
  try {
    const ai = await extractStructuredApplicationProfile(resumeText);
    const work_history = normalizeWorkHistory(ai.work_history);
    const education = normalizeEducationHistory(ai.education);
    const warnings = [...(ai.warnings ?? [])];
    if (!work_history.length) {
      warnings.push('AI found no jobs — check resume format or try again.');
    }
    return {
      work_history,
      education,
      source: 'ai',
      warnings,
    };
  } catch (e) {
    console.warn('[structured-profile] AI extract failed:', (e as Error).message);
    return {
      work_history: [],
      education: [],
      source: 'ai',
      warnings: [`AI extraction failed: ${(e as Error).message}`, AI_ONLY_WARNING],
    };
  }
}

/** Extract from resume text and persist on apply_profiles (clears review until user confirms). */
export async function extractAndSaveStructuredProfile(
  sb: SupabaseClient,
  profileId: string,
  resumeText: string,
): Promise<StructureSaveResult> {
  const result = await extractStructuredFromResume(resumeText);
  const now = new Date().toISOString();
  const { error } = await sb.from('apply_profiles').upsert(
    {
      profile_id: profileId,
      structured_work_history: result.work_history,
      structured_education: result.education,
      structure_extracted_at: now,
      structure_reviewed_at: null,
      structure_source: result.source,
      structure_warnings: result.warnings,
      updated_at: now,
    },
    { onConflict: 'profile_id' },
  );
  if (error) throw new Error(error.message);
  return result;
}

export async function saveStructuredProfileEdits(
  sb: SupabaseClient,
  profileId: string,
  payload: {
    structured_work_history?: StructuredWorkEntry[];
    structured_education?: StructuredEducationEntry[];
    mark_reviewed?: boolean;
  },
): Promise<void> {
  const work = normalizeWorkHistory(payload.structured_work_history ?? []);
  const edu = normalizeEducationHistory(payload.structured_education ?? []);
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = {
    profile_id: profileId,
    structured_work_history: work,
    structured_education: edu,
    structure_source: 'manual',
    updated_at: now,
  };
  if (!payload.mark_reviewed) {
    patch.structure_reviewed_at = null;
  } else {
    patch.structure_reviewed_at = now;
  }
  const { error } = await sb.from('apply_profiles').upsert(patch, { onConflict: 'profile_id' });
  if (error) throw new Error(error.message);
}

export async function markStructureReviewed(
  sb: SupabaseClient,
  profileId: string,
): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await sb
    .from('apply_profiles')
    .upsert(
      { profile_id: profileId, structure_reviewed_at: now, updated_at: now },
      { onConflict: 'profile_id' },
    );
  if (error) throw new Error(error.message);
}
