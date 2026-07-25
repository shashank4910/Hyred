/** Pure remote / worldwide labels — not useful as city filter options. */
const REMOTE_LABEL =
  /^(remote|anywhere|work from home|wfh|global|worldwide|hybrid)$/i;

/**
 * Pull a city-style label from a job location string.
 * "Gurgaon, Haryana, India" → "Gurgaon"
 * "Bengaluru · India" → "Bengaluru"
 */
export function extractCityLabel(location: string | null | undefined): string | null {
  if (!location) return null;
  const cleaned = location.trim();
  if (!cleaned || REMOTE_LABEL.test(cleaned)) return null;

  const first = cleaned.split(/[,·|;/]/)[0]?.trim() ?? '';
  if (!first || REMOTE_LABEL.test(first)) return null;
  // Drop trailing country-only crumbs like "India" when it's the whole string — keep cities.
  if (first.length < 2) return null;
  return first;
}

/** Escape PostgREST ilike wildcards in a city filter value. */
export function sanitizeCityFilter(city: string | null | undefined): string {
  if (!city) return '';
  return city.replace(/[%_,]/g, '').trim();
}

/**
 * Unique sorted city labels from raw location strings (case-insensitive de-dupe).
 */
export function uniqueCitiesFromLocations(
  locations: Array<string | null | undefined>,
): string[] {
  const byKey = new Map<string, string>();
  for (const loc of locations) {
    const city = extractCityLabel(loc);
    if (!city) continue;
    const key = city.toLowerCase();
    if (!byKey.has(key)) byKey.set(key, city);
  }
  return [...byKey.values()].sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: 'base' }),
  );
}
