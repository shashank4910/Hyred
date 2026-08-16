/** Career level options shown on My Resume — used for scoring hints. */
export const PROFILE_SENIORITY_OPTIONS = [
  { value: 'junior', label: 'Junior' },
  { value: 'mid', label: 'Mid-level' },
  { value: 'senior', label: 'Senior' },
  { value: 'lead', label: 'Lead' },
  { value: 'sr_lead', label: 'Sr. Lead' },
  { value: 'staff', label: 'Staff' },
  { value: 'principal', label: 'Principal' },
  { value: 'manager', label: 'Manager' },
  { value: 'sr_manager', label: 'Sr. Manager' },
  { value: 'director', label: 'Director' },
  { value: 'unknown', label: 'Not sure' },
] as const;

export type ProfileSeniority = (typeof PROFILE_SENIORITY_OPTIONS)[number]['value'];

const VALUE_SET = new Set<string>(PROFILE_SENIORITY_OPTIONS.map((o) => o.value));

/** Map AI / legacy labels into our stored seniority values. */
export function normalizeProfileSeniority(
  value: string | undefined | null,
): ProfileSeniority {
  if (!value) return 'unknown';
  const raw = value.trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (VALUE_SET.has(raw)) return raw as ProfileSeniority;
  if (raw === 'senior_lead' || raw === 'srlead') return 'sr_lead';
  if (raw === 'senior_manager' || raw === 'sr_mgr') return 'sr_manager';
  if (raw === 'entry' || raw === 'intern') return 'junior';
  if (raw === 'mid_level' || raw === 'middle') return 'mid';
  return 'unknown';
}

export function seniorityLabel(value: ProfileSeniority | string | undefined): string {
  const norm = normalizeProfileSeniority(value);
  return PROFILE_SENIORITY_OPTIONS.find((o) => o.value === norm)?.label ?? 'Not sure';
}
