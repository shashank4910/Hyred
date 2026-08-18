/**
 * Company logo resolution for job cards and anywhere a company name is shown.
 *
 * Strategy (free infra only — no API keys, no paid services):
 *   1. Curated company → domain map for names whose real domain isn't the
 *      naive "slug + .com" (banks, Indian conglomerates, acronyms, etc.).
 *   2. Fallback: deburr + normalize the name, drop legal suffixes and
 *      stopwords, join the remaining tokens → `{slug}.com`.
 *   3. Render via Google's keyless favicon service (`s2/favicons`). Favicons
 *      are a reliable brand mark for the vast majority of companies.
 *
 * Client components pair this with an initial-letter fallback on image error
 * (see `app/(app)/_components/CompanyLogo.tsx`).
 */

/** Curated overrides — normalized (lowercase, collapsed) name → domain. */
const COMPANY_DOMAINS: Record<string, string> = {
  // ===== Banks / finance (real domains differ from slug.com) =====
  'bank of america': 'bankofamerica.com',
  bofa: 'bankofamerica.com',
  'charles schwab': 'schwab.com',
  schwab: 'schwab.com',
  'deutsche bank': 'db.com',
  'credit suisse': 'credit-suisse.com',
  citi: 'citigroup.com',
  citibank: 'citigroup.com',
  citigroup: 'citigroup.com',
  hdfc: 'hdfcbank.com',
  'hdfc bank': 'hdfcbank.com',
  icici: 'icicibank.com',
  'icici bank': 'icicibank.com',
  'american express': 'americanexpress.com',
  amex: 'americanexpress.com',
  unitedhealth: 'uhg.com',
  'unitedhealth group': 'uhg.com',
  optum: 'optum.com',
  'visa inc': 'visa.com',

  // ===== Big 4 / consulting / IT services =====
  'ernst young': 'ey.com', // "Ernst & Young" normalizes to "ernst young"
  'ernst and young': 'ey.com',
  ey: 'ey.com',
  pwc: 'pwc.com',
  tcs: 'tcs.com',
  'tata consultancy': 'tcs.com',
  'tata consultancy services': 'tcs.com',
  'tata consultancy services limited': 'tcs.com',
  exl: 'exlservice.com',
  'exl service': 'exlservice.com',
  'sonata software': 'sonata-software.com',

  // ===== Indian conglomerates / consumer / unicorns =====
  reliance: 'ril.com',
  jio: 'ril.com',
  'bharti airtel': 'airtel.com',
  'ola electric': 'ola.cab',
  'ola cabs': 'ola.cab',
  itc: 'itcportal.com',
  'itc limited': 'itcportal.com',
  'hindustan unilever': 'hul.co.in',
  titan: 'titan.co.in',
  'titan company': 'titan.co.in',
  ola: 'ola.cab',
  olacabs: 'ola.cab',
  cred: 'cred.club',
  groww: 'groww.in',
  jupiter: 'jupiter.money',
  'jupiter money': 'jupiter.money',
  slice: 'sliceit.com',
  physicswallah: 'pw.live',
  'physics wallah': 'pw.live',
  boat: 'boat-lifestyle.com',
  'boat lifestyle': 'boat-lifestyle.com',
  'imagine marketing': 'boat-lifestyle.com',
  mamaearth: 'mamaearth.in',
  zeta: 'zeta.app',
  'urban company': 'urbancompany.com',

  // ===== Global product / industrial =====
  'johnson johnson': 'jnj.com', // "Johnson & Johnson" normalizes to "johnson johnson"
  'johnson and johnson': 'jnj.com',
  'procter gamble': 'pg.com', // "Procter & Gamble" normalizes to "procter gamble"
  'procter and gamble': 'pg.com',
  'p g': 'pg.com',
  'general electric': 'ge.com',
  ge: 'ge.com',
  'general motors': 'gm.com',
  gm: 'gm.com',
  'lockheed martin': 'lockheedmartin.com',
  'schneider electric': 'se.com',
  'dr reddy': 'drreddys.com',
  'dr reddy s': 'drreddys.com',
  'dr reddys': 'drreddys.com',
  mercedes: 'mercedes-benz.com',
  'mercedes benz': 'mercedes-benz.com',
  volkswagen: 'volkswagen.com',
  juniper: 'juniper.net',
  'juniper networks': 'juniper.net',
  elastic: 'elastic.co',
  hasura: 'hasura.io',
  'block inc': 'block.xyz',
  square: 'squareup.com',
  zoom: 'zoom.us',
  confluent: 'confluent.io',
  notion: 'notion.so',
  payu: 'payu.in',
  'x corp': 'x.com',
  twitter: 'x.com',
  alphabet: 'abc.xyz',

  // ===== Two-letter / acronym domains (slug fallback is length-3+) =====
  '3m': '3m.com',
  hp: 'hp.com',
  hpe: 'hpe.com',
  ubs: 'ubs.com',
  wns: 'wns.com',

  // ===== IT services / consulting — real domains differ from the slug =====
  hcl: 'hcltech.com',
  'hcl tech': 'hcltech.com',
  'hcl technologies': 'hcltech.com',
  'hcl technologies limited': 'hcltech.com',
  lti: 'ltimindtree.com',
  ltimindtree: 'ltimindtree.com',
  'lti mindtree': 'ltimindtree.com',
  'persistent systems': 'persistent.com',
  'persistent systems limited': 'persistent.com',
  'dell technologies': 'dell.com',
  'dell technologies inc': 'dell.com',
  'dell technologies india': 'dell.com',
  'sap labs': 'sap.com',
  'sap labs india': 'sap.com',
  'sap india': 'sap.com',
  'genpact india': 'genpact.com',

  // ===== Product / hardware — non-slug domains =====
  bmc: 'bmc.com',
  'bmc software': 'bmc.com',
  'bmc helix': 'bmc.com',
  'texas instruments': 'ti.com',
  'texas instruments india': 'ti.com',
  roche: 'roche.com',
  '6221 roche information solutions india private limited': 'roche.com',
  'roche information solutions': 'roche.com',
  'workday india': 'workday.com',
  'adobe systems': 'adobe.com',
  'adobe systems india': 'adobe.com',
  'intel corporation': 'intel.com',
  'oracle india': 'oracle.com',
  'salesforce india': 'salesforce.com',
  'vmware india': 'vmware.com',
  'broadcom india': 'broadcom.com',
  'samsung india': 'samsung.com',
  'lenovo india': 'lenovo.com',
  'sony india': 'sony.com',

  // ===== Banks / finance — non-slug domains =====
  jpmorgan: 'jpmorganchase.com',
  'jpmorgan chase': 'jpmorganchase.com',
  'j p morgan': 'jpmorganchase.com',
  'j.p. morgan': 'jpmorganchase.com',
  'goldman sachs': 'goldmansachs.com',
  'morgan stanley': 'morganstanley.com',
  'wells fargo': 'wellsfargo.com',
  'state street': 'statestreet.com',
  'state street corporation': 'statestreet.com',
  'standard chartered': 'sc.com',
  'standard chartered bank': 'sc.com',
  'dbs bank': 'dbs.com',
  'dbs group': 'dbs.com',
  barclays: 'barclays.com',
  'barclays bank': 'barclays.com',
  'royal bank of canada': 'rbc.com',
  rbc: 'rbc.com',
  'hongkong and shanghai banking corporation': 'hsbc.com',
  hsbc: 'hsbc.com',
  'nomura holdings': 'nomura.com',
  'macquarie group': 'macquarie.com',

  // ===== Consumer / internet — non-slug domains =====
  meta: 'meta.com',
  'meta platforms': 'meta.com',
  facebook: 'facebook.com',
  netflix: 'netflix.com',
  airbnb: 'airbnb.com',
  uber: 'uber.com',
  'uber technologies': 'uber.com',
  'wayfair india': 'wayfair.com',
  'booking holdings': 'booking.com',
  'delivery hero': 'deliveryhero.com',
  'takeaway com': 'takeaway.com',
  'just eat': 'justeattakeaway.com',
  'shopify india': 'shopify.com',
  'paypal india': 'paypal.com',
  'walmart global tech': 'walmart.com',
  'walmart labs': 'walmart.com',
  'target corporation': 'target.com',
  'albertsons companies': 'albertsons.com',
  'kroger company': 'kroger.com',
  cvs: 'cvs.com',
  'cvs health': 'cvs.com',
  walmart: 'walmart.com',

  // ===== Indian unicorns / consumer tech =====
  flipkart: 'flipkart.com',
  myntra: 'myntra.com',
  swiggy: 'swiggy.com',
  zomato: 'zomato.com',
  phonepe: 'phonepe.com',
  paytm: 'paytm.com',
  razorpay: 'razorpay.com',
  meesho: 'meesho.com',
  zepto: 'zepto.com',
  'zoho corporation': 'zoho.com',
  zoho: 'zoho.com',
  'freshworks india': 'freshworks.com',
  'chargebee india': 'chargebee.com',
  'postman india': 'postman.com',
  'atlassian india': 'atlassian.com',
  'zendesk india': 'zendesk.com',
  'tata motors': 'tatamotors.com',
  'mahindra mahindra': 'mahindra.com',
  'maruti suzuki': 'marutisuzuki.com',
  'bajaj auto': 'bajajauto.com',
  'hero motocorp': 'heromotocorp.com',
  'mahindra group': 'mahindra.com',
  'adani group': 'adanienterprises.com',
  'vedanta limited': 'vedantaresources.com',
};

/** Words stripped when deriving the fallback slug (legal suffixes etc.). */
const SUFFIX_WORDS = new Set([
  'limited',
  'ltd',
  'inc',
  'llc',
  'corp',
  'corporation',
  'company',
  'co',
  'pvt',
  'private',
  'gmbh',
  'plc',
  'sa',
  'ag',
  'holdings',
  'holding',
  'group',
  'technologies',
  'technology',
  'systems',
  'solutions',
  'services',
  'service',
  'software',
  'digital',
  'global',
  'international',
  'india',
  'indian',
  'industries',
  'enterprises',
  'labs',
  'and',
  'of',
  'the',
]);

/** Lowercase, strip diacritics, collapse non-alphanumerics to single spaces. */
function normalizeName(name: string): string {
  const deburred = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  return deburred
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Best-guess domain for a company name, or null when nothing reasonable can
 * be derived (caller falls back to an initial-letter placeholder).
 */
export function companyDomain(
  name: string | null | undefined,
): string | null {
  if (!name) return null;
  const key = normalizeName(name);
  if (!key) return null;

  const direct = COMPANY_DOMAINS[key];
  if (direct) return direct;

  // Exact key miss — try a suffix-stripped key (e.g. "TCS Ltd" → "tcs").
  const stripped = key
    .split(' ')
    .filter((t) => t && !SUFFIX_WORDS.has(t))
    .join(' ');
  if (stripped && stripped !== key) {
    const viaStrip = COMPANY_DOMAINS[stripped];
    if (viaStrip) return viaStrip;
  }

  const tokens = key
    .split(' ')
    .filter((t) => t.length > 1 && !SUFFIX_WORDS.has(t))
    .slice(0, 3);
  const slug = tokens.join('');
  if (slug.length >= 3 && /^[a-z0-9]+$/.test(slug)) {
    return `${slug}.com`;
  }
  return null;
}

/** Keyless Google favicon URL for a company, or null when unresolvable. */
export function companyLogoUrl(
  name: string | null | undefined,
  displaySize = 32,
): string | null {
  const domain = companyDomain(name);
  if (!domain) return null;
  const sz = Math.min(128, Math.max(32, Math.round(displaySize * 2)));
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=${sz}`;
}

/**
 * Secondary keyless source tried when Google's favicon fails to load
 * (DuckDuckGo icons endpoint). Falls back to the monogram tile if both fail.
 */
export function companyLogoFallbackUrl(
  name: string | null | undefined,
): string | null {
  const domain = companyDomain(name);
  if (!domain) return null;
  return `https://icons.duckduckgo.com/ip3/${encodeURIComponent(domain)}.ico`;
}

/**
 * Initial for the monogram fallback tile — the first ALPHABETIC character
 * (skips leading digits/junk like "6221 Roche…" → "R").
 */
export function companyInitial(
  name: string | null | undefined,
): string {
  if (!name) return '?';
  const m = name.match(/[a-z]/i);
  return m ? m[0].toUpperCase() : '?';
}
