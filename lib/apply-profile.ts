/**
 * Normalize apply-profile payload before DB write.
 * years_experience allows one decimal (e.g. 7.7) — matches resume insights.
 */
export function parseYearsExperience(raw: unknown): number | null {
  if (raw == null || raw === '') return null;
  const n =
    typeof raw === 'number'
      ? raw
      : parseFloat(String(raw).trim().replace(/,/g, ''));
  if (!Number.isFinite(n) || n < 0 || n > 50) return null;
  return Math.round(n * 10) / 10;
}

export function sanitizeApplyProfilePayload(
  body: Record<string, unknown>,
): Record<string, unknown> {
  const out = { ...body };
  if ('years_experience' in out) {
    out.years_experience = parseYearsExperience(out.years_experience);
  }
  if ('available_from' in out && out.available_from === '') {
    out.available_from = null;
  }
  return out;
}
