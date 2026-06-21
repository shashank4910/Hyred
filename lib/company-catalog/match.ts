/** Word-boundary company name matching (same rules as Top MNC). */
function normalize(s: string): string {
  return ` ${s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim()} `;
}

export function patternsFromDisplayName(name: string): string[] {
  const lower = name.toLowerCase().trim();
  const compact = lower.replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
  const set = new Set<string>();
  if (compact) set.add(compact);
  for (const part of compact.split(' ')) {
    if (part.length >= 3) set.add(part);
  }
  return [...set];
}

export function jobCompanyMatchesPatterns(
  companyName: string | null | undefined,
  patterns: string[],
): boolean {
  if (!companyName?.trim() || patterns.length === 0) return false;
  const hay = normalize(companyName);
  for (const pattern of patterns) {
    const needle = ` ${pattern.toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim()} `;
    if (needle !== '  ' && hay.includes(needle)) return true;
  }
  return false;
}
