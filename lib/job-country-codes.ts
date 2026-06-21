import type { Preferences, ResumeInsights } from './types';

/** Map free-text location strings → ISO 3166-1 alpha-2 for job APIs. */
const COUNTRY_RULES: Array<{ code: string; test: (s: string) => boolean }> = [
  {
    code: 'IN',
    test: (s) =>
      /\b(india|bharat|noida|gurgaon|gurugram|bangalore|bengaluru|hyderabad|pune|mumbai|bombay|delhi|ncr|chennai|kolkata|calcutta|ahmedabad|jaipur|chandigarh|kochi|kerala|tamil nadu|karnataka|maharashtra)\b/i.test(
        s,
      ),
  },
  {
    code: 'US',
    test: (s) =>
      /\b(united states|u\.?s\.?a?\.?|america|usa|new york|san francisco|seattle|austin|boston|chicago|denver|atlanta|dallas|houston|california|texas|washington|oregon|florida|silicon valley|bay area)\b/i.test(
        s,
      ),
  },
  {
    code: 'GB',
    test: (s) =>
      /\b(united kingdom|u\.?k\.?|britain|england|scotland|wales|london|manchester|birmingham|edinburgh)\b/i.test(
        s,
      ),
  },
  {
    code: 'CA',
    test: (s) =>
      /\b(canada|toronto|vancouver|montreal|ottawa|calgary|ontario|british columbia)\b/i.test(s),
  },
  {
    code: 'DE',
    test: (s) =>
      /\b(germany|deutschland|berlin|munich|münchen|frankfurt|hamburg)\b/i.test(s),
  },
  {
    code: 'AU',
    test: (s) =>
      /\b(australia|sydney|melbourne|brisbane|perth|canberra)\b/i.test(s),
  },
  {
    code: 'SG',
    test: (s) => /\b(singapore)\b/i.test(s),
  },
  {
    code: 'AE',
    test: (s) =>
      /\b(uae|dubai|abu dhabi|united arab emirates)\b/i.test(s),
  },
];

const REMOTE_ONLY = /^(remote|anywhere|work from home|wfh|global)$/i;

/**
 * ISO country codes for paid job APIs (JobsPipe, JobDataLake, JSearch).
 *
 * - Uses onboarding `preferences.locations` + resume `current_location`.
 * - `remote_only` or only "Remote" → undefined (no country filter, global search).
 * - Unrecognized city with no country → undefined (global, safer than guessing IN).
 */
export function buildJobCountryCodes(
  prefs?: Preferences | null,
  insights?: ResumeInsights | null,
): string[] | undefined {
  if (prefs?.remote_only) return undefined;

  const locStrings = [
    ...(prefs?.locations ?? []),
    insights?.current_location ?? '',
  ]
    .map((s) => s.trim())
    .filter(Boolean);

  if (locStrings.length === 0) return undefined;

  const allRemote = locStrings.every((l) => REMOTE_ONLY.test(l));
  if (allRemote) return undefined;

  const codes = new Set<string>();
  for (const loc of locStrings) {
    if (REMOTE_ONLY.test(loc)) continue;
    for (const { code, test } of COUNTRY_RULES) {
      if (test(loc)) {
        codes.add(code);
        break;
      }
    }
  }

  if (codes.size === 0) return undefined;
  return [...codes].slice(0, 3);
}

/** JSearch expects a country name, not ISO code. */
export function jsearchCountryParam(codes: string[] | undefined): string | undefined {
  if (!codes?.length) return undefined;
  const names: Record<string, string> = {
    IN: 'India',
    US: 'United States',
    GB: 'United Kingdom',
    CA: 'Canada',
    DE: 'Germany',
    AU: 'Australia',
    SG: 'Singapore',
    AE: 'United Arab Emirates',
  };
  return names[codes[0]];
}

/** Adzuna path segment (e.g. jobs/in/search). */
export function adzunaCountryPath(codes: string[] | undefined): string {
  if (!codes?.length) return 'us';
  const paths: Record<string, string> = {
    IN: 'in',
    US: 'us',
    GB: 'gb',
    CA: 'ca',
    DE: 'de',
    AU: 'au',
    SG: 'sg',
  };
  return paths[codes[0]] ?? 'us';
}
