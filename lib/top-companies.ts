/**
 * Top MNC Hiring — Curated list of Fortune 500, major global tech companies,
 * Big 4 consultancies, large Indian enterprises, and high-value product
 * companies known to hire in India.
 *
 * This powers the "Top MNC Hiring" premium feature. The matching function
 * does case-insensitive substring matching against job company names.
 *
 * To add/remove companies: just edit the COMPANIES array below.
 */

/**
 * Each entry can have multiple patterns (aliases, abbreviations).
 * Matching: if ANY pattern is found as a substring in the job's company
 * name (case-insensitive), the job qualifies as "Top MNC".
 */
type CompanyEntry = {
  name: string;
  patterns: string[];
  category: 'fortune500_tech' | 'fortune500_finance' | 'big4_consulting' | 'indian_mnc' | 'global_product' | 'unicorn_india';
};

const COMPANIES: CompanyEntry[] = [
  // ===== Fortune 500 — Tech =====
  { name: 'Google', patterns: ['google', 'alphabet'], category: 'fortune500_tech' },
  { name: 'Microsoft', patterns: ['microsoft'], category: 'fortune500_tech' },
  { name: 'Amazon', patterns: ['amazon', 'aws'], category: 'fortune500_tech' },
  { name: 'Apple', patterns: ['apple'], category: 'fortune500_tech' },
  { name: 'Meta', patterns: ['meta', 'facebook'], category: 'fortune500_tech' },
  { name: 'Netflix', patterns: ['netflix'], category: 'fortune500_tech' },
  { name: 'Salesforce', patterns: ['salesforce'], category: 'fortune500_tech' },
  { name: 'Oracle', patterns: ['oracle'], category: 'fortune500_tech' },
  { name: 'IBM', patterns: ['ibm'], category: 'fortune500_tech' },
  { name: 'Intel', patterns: ['intel'], category: 'fortune500_tech' },
  { name: 'Cisco', patterns: ['cisco'], category: 'fortune500_tech' },
  { name: 'Adobe', patterns: ['adobe'], category: 'fortune500_tech' },
  { name: 'SAP', patterns: ['sap'], category: 'fortune500_tech' },
  { name: 'Dell', patterns: ['dell'], category: 'fortune500_tech' },
  { name: 'HP', patterns: ['hewlett', 'hp inc', 'hp enterprise', 'hpe'], category: 'fortune500_tech' },
  { name: 'Qualcomm', patterns: ['qualcomm'], category: 'fortune500_tech' },
  { name: 'Texas Instruments', patterns: ['texas instruments'], category: 'fortune500_tech' },
  { name: 'NVIDIA', patterns: ['nvidia'], category: 'fortune500_tech' },
  { name: 'AMD', patterns: ['amd', 'advanced micro'], category: 'fortune500_tech' },
  { name: 'Broadcom', patterns: ['broadcom'], category: 'fortune500_tech' },
  { name: 'VMware', patterns: ['vmware'], category: 'fortune500_tech' },
  { name: 'Uber', patterns: ['uber'], category: 'fortune500_tech' },
  { name: 'PayPal', patterns: ['paypal'], category: 'fortune500_tech' },
  { name: 'Booking Holdings', patterns: ['booking.com', 'booking holdings'], category: 'fortune500_tech' },
  { name: 'eBay', patterns: ['ebay'], category: 'fortune500_tech' },
  { name: 'Intuit', patterns: ['intuit'], category: 'fortune500_tech' },
  { name: 'Autodesk', patterns: ['autodesk'], category: 'fortune500_tech' },
  { name: 'Workday', patterns: ['workday'], category: 'fortune500_tech' },
  { name: 'ServiceNow', patterns: ['servicenow'], category: 'fortune500_tech' },
  { name: 'Palo Alto Networks', patterns: ['palo alto'], category: 'fortune500_tech' },
  { name: 'CrowdStrike', patterns: ['crowdstrike'], category: 'fortune500_tech' },
  { name: 'Snowflake', patterns: ['snowflake'], category: 'fortune500_tech' },
  { name: 'Databricks', patterns: ['databricks'], category: 'fortune500_tech' },
  { name: 'Splunk', patterns: ['splunk'], category: 'fortune500_tech' },
  { name: 'Elastic', patterns: ['elastic'], category: 'fortune500_tech' },
  { name: 'Twilio', patterns: ['twilio'], category: 'fortune500_tech' },
  { name: 'Zoom', patterns: ['zoom video', 'zoom communications'], category: 'fortune500_tech' },
  { name: 'Shopify', patterns: ['shopify'], category: 'fortune500_tech' },
  { name: 'Atlassian', patterns: ['atlassian'], category: 'fortune500_tech' },
  { name: 'Stripe', patterns: ['stripe'], category: 'fortune500_tech' },
  { name: 'Twitter/X', patterns: ['twitter', 'x corp'], category: 'fortune500_tech' },
  { name: 'LinkedIn', patterns: ['linkedin'], category: 'fortune500_tech' },
  { name: 'Spotify', patterns: ['spotify'], category: 'fortune500_tech' },
  { name: 'Airbnb', patterns: ['airbnb'], category: 'fortune500_tech' },
  { name: 'Lyft', patterns: ['lyft'], category: 'fortune500_tech' },
  { name: 'DoorDash', patterns: ['doordash'], category: 'fortune500_tech' },
  { name: 'Block (Square)', patterns: ['block, inc', 'square'], category: 'fortune500_tech' },
  { name: 'Confluent', patterns: ['confluent'], category: 'fortune500_tech' },
  { name: 'MongoDB', patterns: ['mongodb'], category: 'fortune500_tech' },
  { name: 'Cloudflare', patterns: ['cloudflare'], category: 'fortune500_tech' },
  { name: 'Datadog', patterns: ['datadog'], category: 'fortune500_tech' },
  { name: 'HashiCorp', patterns: ['hashicorp'], category: 'fortune500_tech' },
  { name: 'GitLab', patterns: ['gitlab'], category: 'fortune500_tech' },
  { name: 'GitHub', patterns: ['github'], category: 'fortune500_tech' },
  { name: 'Figma', patterns: ['figma'], category: 'fortune500_tech' },
  { name: 'Notion', patterns: ['notion'], category: 'fortune500_tech' },
  { name: 'Vercel', patterns: ['vercel'], category: 'fortune500_tech' },
  { name: 'Supabase', patterns: ['supabase'], category: 'fortune500_tech' },

  // ===== Fortune 500 — Finance / Banking =====
  { name: 'JPMorgan Chase', patterns: ['jpmorgan', 'jp morgan', 'chase'], category: 'fortune500_finance' },
  { name: 'Goldman Sachs', patterns: ['goldman'], category: 'fortune500_finance' },
  { name: 'Morgan Stanley', patterns: ['morgan stanley'], category: 'fortune500_finance' },
  { name: 'Bank of America', patterns: ['bank of america', 'bofa'], category: 'fortune500_finance' },
  { name: 'Citigroup', patterns: ['citi', 'citigroup', 'citibank'], category: 'fortune500_finance' },
  { name: 'Wells Fargo', patterns: ['wells fargo'], category: 'fortune500_finance' },
  { name: 'Charles Schwab', patterns: ['schwab'], category: 'fortune500_finance' },
  { name: 'Barclays', patterns: ['barclays'], category: 'fortune500_finance' },
  { name: 'Deutsche Bank', patterns: ['deutsche bank'], category: 'fortune500_finance' },
  { name: 'HSBC', patterns: ['hsbc'], category: 'fortune500_finance' },
  { name: 'UBS', patterns: ['ubs'], category: 'fortune500_finance' },
  { name: 'Credit Suisse', patterns: ['credit suisse'], category: 'fortune500_finance' },
  { name: 'BNP Paribas', patterns: ['bnp paribas'], category: 'fortune500_finance' },
  { name: 'Standard Chartered', patterns: ['standard chartered'], category: 'fortune500_finance' },
  { name: 'American Express', patterns: ['american express', 'amex'], category: 'fortune500_finance' },
  { name: 'Visa', patterns: ['visa'], category: 'fortune500_finance' },
  { name: 'Mastercard', patterns: ['mastercard'], category: 'fortune500_finance' },
  { name: 'Fidelity', patterns: ['fidelity'], category: 'fortune500_finance' },
  { name: 'BlackRock', patterns: ['blackrock'], category: 'fortune500_finance' },
  { name: 'Nomura', patterns: ['nomura'], category: 'fortune500_finance' },

  // ===== Big 4 + Consulting =====
  { name: 'Deloitte', patterns: ['deloitte'], category: 'big4_consulting' },
  { name: 'PwC', patterns: ['pwc', 'pricewaterhouse'], category: 'big4_consulting' },
  { name: 'EY', patterns: ['ernst & young', 'ernst and young', ' ey '], category: 'big4_consulting' },
  { name: 'KPMG', patterns: ['kpmg'], category: 'big4_consulting' },
  { name: 'Accenture', patterns: ['accenture'], category: 'big4_consulting' },
  { name: 'McKinsey', patterns: ['mckinsey'], category: 'big4_consulting' },
  { name: 'BCG', patterns: ['boston consulting', 'bcg'], category: 'big4_consulting' },
  { name: 'Bain', patterns: ['bain & company', 'bain and company'], category: 'big4_consulting' },
  { name: 'Capgemini', patterns: ['capgemini'], category: 'big4_consulting' },
  { name: 'Cognizant', patterns: ['cognizant'], category: 'big4_consulting' },
  { name: 'Infosys', patterns: ['infosys'], category: 'big4_consulting' },
  { name: 'Wipro', patterns: ['wipro'], category: 'big4_consulting' },
  { name: 'TCS', patterns: ['tata consultancy', 'tcs'], category: 'big4_consulting' },
  { name: 'HCL Tech', patterns: ['hcl tech', 'hcltech'], category: 'big4_consulting' },
  { name: 'Tech Mahindra', patterns: ['tech mahindra'], category: 'big4_consulting' },
  { name: 'LTIMindtree', patterns: ['ltimindtree', 'lti mindtree', 'larsen & toubro infotech'], category: 'big4_consulting' },
  { name: 'Mphasis', patterns: ['mphasis'], category: 'big4_consulting' },
  { name: 'Persistent Systems', patterns: ['persistent systems'], category: 'big4_consulting' },
  { name: 'Coforge', patterns: ['coforge'], category: 'big4_consulting' },
  { name: 'Thoughtworks', patterns: ['thoughtworks'], category: 'big4_consulting' },

  // ===== Indian MNCs / Large Enterprises =====
  { name: 'Reliance', patterns: ['reliance', 'jio'], category: 'indian_mnc' },
  { name: 'Tata Group', patterns: ['tata motors', 'tata steel', 'tata communications', 'tata digital', 'tata elxsi', 'tata technologies'], category: 'indian_mnc' },
  { name: 'Mahindra', patterns: ['mahindra'], category: 'indian_mnc' },
  { name: 'Bharti Airtel', patterns: ['airtel', 'bharti'], category: 'indian_mnc' },
  { name: 'HDFC Bank', patterns: ['hdfc'], category: 'indian_mnc' },
  { name: 'ICICI Bank', patterns: ['icici'], category: 'indian_mnc' },
  { name: 'Kotak Mahindra', patterns: ['kotak'], category: 'indian_mnc' },
  { name: 'Bajaj', patterns: ['bajaj finserv', 'bajaj finance', 'bajaj auto'], category: 'indian_mnc' },
  { name: 'Adani', patterns: ['adani'], category: 'indian_mnc' },
  { name: 'Larsen & Toubro', patterns: ['larsen', 'l&t '], category: 'indian_mnc' },
  { name: 'ITC', patterns: ['itc limited', 'itc ltd'], category: 'indian_mnc' },
  { name: 'Hindustan Unilever', patterns: ['hindustan unilever', 'hul'], category: 'indian_mnc' },
  { name: 'Asian Paints', patterns: ['asian paints'], category: 'indian_mnc' },
  { name: 'Godrej', patterns: ['godrej'], category: 'indian_mnc' },
  { name: 'Titan', patterns: ['titan company'], category: 'indian_mnc' },
  { name: 'Zomato', patterns: ['zomato'], category: 'indian_mnc' },
  { name: 'Swiggy', patterns: ['swiggy'], category: 'indian_mnc' },
  { name: 'Paytm', patterns: ['paytm', 'one97'], category: 'indian_mnc' },
  { name: 'PolicyBazaar', patterns: ['policybazaar'], category: 'indian_mnc' },
  { name: 'Nykaa', patterns: ['nykaa'], category: 'indian_mnc' },

  // ===== Global Product Companies (hiring in India) =====
  { name: 'Samsung', patterns: ['samsung'], category: 'global_product' },
  { name: 'Sony', patterns: ['sony'], category: 'global_product' },
  { name: 'Siemens', patterns: ['siemens'], category: 'global_product' },
  { name: 'Bosch', patterns: ['bosch'], category: 'global_product' },
  { name: 'Philips', patterns: ['philips'], category: 'global_product' },
  { name: 'General Electric', patterns: ['general electric', ' ge '], category: 'global_product' },
  { name: 'Johnson & Johnson', patterns: ['johnson & johnson', 'j&j'], category: 'global_product' },
  { name: 'Procter & Gamble', patterns: ['procter', 'p&g'], category: 'global_product' },
  { name: 'Unilever', patterns: ['unilever'], category: 'global_product' },
  { name: 'Nestle', patterns: ['nestle', 'nestlé'], category: 'global_product' },
  { name: 'Toyota', patterns: ['toyota'], category: 'global_product' },
  { name: 'BMW', patterns: ['bmw'], category: 'global_product' },
  { name: 'Mercedes-Benz', patterns: ['mercedes'], category: 'global_product' },
  { name: 'Volkswagen', patterns: ['volkswagen'], category: 'global_product' },
  { name: 'Boeing', patterns: ['boeing'], category: 'global_product' },
  { name: 'Lockheed Martin', patterns: ['lockheed'], category: 'global_product' },
  { name: 'Honeywell', patterns: ['honeywell'], category: 'global_product' },
  { name: '3M', patterns: ['3m company', '3m india'], category: 'global_product' },
  { name: 'ABB', patterns: ['abb'], category: 'global_product' },
  { name: 'Schneider Electric', patterns: ['schneider'], category: 'global_product' },
  { name: 'ThoughtSpot', patterns: ['thoughtspot'], category: 'global_product' },
  { name: 'Freshworks', patterns: ['freshworks'], category: 'global_product' },
  { name: 'Zoho', patterns: ['zoho'], category: 'global_product' },
  { name: 'Druva', patterns: ['druva'], category: 'global_product' },
  { name: 'Postman', patterns: ['postman'], category: 'global_product' },
  { name: 'BrowserStack', patterns: ['browserstack'], category: 'global_product' },
  { name: 'Chargebee', patterns: ['chargebee'], category: 'global_product' },
  { name: 'CleverTap', patterns: ['clevertap'], category: 'global_product' },
  { name: 'Hasura', patterns: ['hasura'], category: 'global_product' },

  // ===== Indian Unicorns / High-Growth =====
  { name: 'Flipkart', patterns: ['flipkart'], category: 'unicorn_india' },
  { name: 'PhonePe', patterns: ['phonepe'], category: 'unicorn_india' },
  { name: 'Razorpay', patterns: ['razorpay'], category: 'unicorn_india' },
  { name: 'CRED', patterns: ['cred'], category: 'unicorn_india' },
  { name: 'Zerodha', patterns: ['zerodha'], category: 'unicorn_india' },
  { name: 'Groww', patterns: ['groww'], category: 'unicorn_india' },
  { name: 'Meesho', patterns: ['meesho'], category: 'unicorn_india' },
  { name: 'Ola', patterns: ['ola cabs', 'ola electric', 'olacabs'], category: 'unicorn_india' },
  { name: 'Byju\'s', patterns: ['byju'], category: 'unicorn_india' },
  { name: 'Unacademy', patterns: ['unacademy'], category: 'unicorn_india' },
  { name: 'Dream11', patterns: ['dream11', 'dream sports'], category: 'unicorn_india' },
  { name: 'ShareChat', patterns: ['sharechat'], category: 'unicorn_india' },
  { name: 'Lenskart', patterns: ['lenskart'], category: 'unicorn_india' },
  { name: 'Delhivery', patterns: ['delhivery'], category: 'unicorn_india' },
  { name: 'Pine Labs', patterns: ['pine labs'], category: 'unicorn_india' },
  { name: 'Upstox', patterns: ['upstox'], category: 'unicorn_india' },
  { name: 'Jupiter', patterns: ['jupiter money'], category: 'unicorn_india' },
  { name: 'Slice', patterns: ['slice'], category: 'unicorn_india' },
  { name: 'Urban Company', patterns: ['urban company'], category: 'unicorn_india' },
  { name: 'CarDekho', patterns: ['cardekho'], category: 'unicorn_india' },
  { name: 'Zepto', patterns: ['zepto'], category: 'unicorn_india' },
  { name: 'PhysicsWallah', patterns: ['physicswallah', 'physics wallah'], category: 'unicorn_india' },
  { name: 'upGrad', patterns: ['upgrad'], category: 'unicorn_india' },
  { name: 'boAt', patterns: ['imagine marketing', 'boat lifestyle'], category: 'unicorn_india' },
  { name: 'Mamaearth', patterns: ['mamaearth', 'honasa'], category: 'unicorn_india' },
  { name: 'Innovaccer', patterns: ['innovaccer'], category: 'unicorn_india' },
  { name: 'Gupshup', patterns: ['gupshup'], category: 'unicorn_india' },
  { name: 'Zeta', patterns: ['zeta suite'], category: 'unicorn_india' },

  // ===== Retail / Apparel / Consumer (Fortune 500 / global, hire tech in India) =====
  { name: 'Levi Strauss', patterns: ['levi strauss', 'levi\'s', 'levis'], category: 'global_product' },
  { name: 'Nike', patterns: ['nike'], category: 'global_product' },
  { name: 'Adidas', patterns: ['adidas'], category: 'global_product' },
  { name: 'Walmart', patterns: ['walmart', 'walmart labs', 'walmart global tech'], category: 'fortune500_tech' },
  { name: 'Target', patterns: ['target corporation', 'target india'], category: 'fortune500_tech' },
  { name: 'Lowe\'s', patterns: ["lowe's", 'lowes india'], category: 'fortune500_tech' },
  { name: 'PepsiCo', patterns: ['pepsico', 'pepsi'], category: 'global_product' },
  { name: 'Coca-Cola', patterns: ['coca-cola', 'coca cola'], category: 'global_product' },
  { name: 'Mondelez', patterns: ['mondelez', 'mondelēz'], category: 'global_product' },
  { name: 'Colgate-Palmolive', patterns: ['colgate'], category: 'global_product' },
  { name: 'Kraft Heinz', patterns: ['kraft heinz'], category: 'global_product' },
  { name: 'Reckitt', patterns: ['reckitt'], category: 'global_product' },
  { name: 'H&M', patterns: ['h&m', 'hennes mauritz'], category: 'global_product' },
  { name: 'Inditex/Zara', patterns: ['inditex', 'zara'], category: 'global_product' },
  { name: 'Decathlon', patterns: ['decathlon'], category: 'global_product' },
  { name: 'IKEA', patterns: ['ikea', 'ingka'], category: 'global_product' },

  // ===== Pharma / Healthcare (Fortune 500, hire tech in India) =====
  { name: 'Pfizer', patterns: ['pfizer'], category: 'global_product' },
  { name: 'Novartis', patterns: ['novartis'], category: 'global_product' },
  { name: 'Roche', patterns: ['roche'], category: 'global_product' },
  { name: 'AstraZeneca', patterns: ['astrazeneca'], category: 'global_product' },
  { name: 'GSK', patterns: ['glaxosmithkline', 'gsk'], category: 'global_product' },
  { name: 'Merck', patterns: ['merck', 'msd'], category: 'global_product' },
  { name: 'Sanofi', patterns: ['sanofi'], category: 'global_product' },
  { name: 'Novo Nordisk', patterns: ['novo nordisk'], category: 'global_product' },
  { name: 'UnitedHealth/Optum', patterns: ['unitedhealth', 'optum'], category: 'global_product' },
  { name: 'Sun Pharma', patterns: ['sun pharma'], category: 'indian_mnc' },
  { name: 'Dr Reddy\'s', patterns: ["dr. reddy", "dr reddy", 'dr reddys'], category: 'indian_mnc' },
  { name: 'Cipla', patterns: ['cipla'], category: 'indian_mnc' },

  // ===== Auto / Industrial (Fortune 500, hire tech in India) =====
  { name: 'Ford', patterns: ['ford motor', 'ford india'], category: 'global_product' },
  { name: 'General Motors', patterns: ['general motors'], category: 'global_product' },
  { name: 'Hyundai', patterns: ['hyundai'], category: 'global_product' },
  { name: 'Maruti Suzuki', patterns: ['maruti'], category: 'indian_mnc' },
  { name: 'Caterpillar', patterns: ['caterpillar'], category: 'global_product' },
  { name: 'Cummins', patterns: ['cummins'], category: 'global_product' },
  { name: 'Emerson', patterns: ['emerson'], category: 'global_product' },
  { name: 'John Deere', patterns: ['john deere', 'deere & company'], category: 'global_product' },

  // ===== Telecom / Networking =====
  { name: 'Ericsson', patterns: ['ericsson'], category: 'global_product' },
  { name: 'Nokia', patterns: ['nokia'], category: 'global_product' },
  { name: 'Vodafone', patterns: ['vodafone'], category: 'global_product' },
  { name: 'Juniper Networks', patterns: ['juniper'], category: 'fortune500_tech' },
  { name: 'Arista Networks', patterns: ['arista'], category: 'fortune500_tech' },

  // ===== More global tech / SaaS (hire heavily in India) =====
  { name: 'Akamai', patterns: ['akamai'], category: 'fortune500_tech' },
  { name: 'Nutanix', patterns: ['nutanix'], category: 'fortune500_tech' },
  { name: 'Pure Storage', patterns: ['pure storage'], category: 'fortune500_tech' },
  { name: 'NetApp', patterns: ['netapp'], category: 'fortune500_tech' },
  { name: 'Western Digital', patterns: ['western digital'], category: 'fortune500_tech' },
  { name: 'Micron', patterns: ['micron'], category: 'fortune500_tech' },
  { name: 'Expedia', patterns: ['expedia'], category: 'fortune500_tech' },
  { name: 'Visa', patterns: ['visa inc'], category: 'fortune500_finance' },
  { name: 'Wayfair', patterns: ['wayfair'], category: 'fortune500_tech' },
  { name: 'PayU', patterns: ['payu'], category: 'global_product' },
  { name: 'Tesco', patterns: ['tesco'], category: 'global_product' },
  { name: 'Mastercard (India)', patterns: ['mastercard'], category: 'fortune500_finance' },
  { name: 'Wells Fargo (India)', patterns: ['wells fargo'], category: 'fortune500_finance' },

  // ===== More India IT services / GCC =====
  { name: 'Genpact', patterns: ['genpact'], category: 'big4_consulting' },
  { name: 'WNS', patterns: ['wns global', 'wns holdings'], category: 'big4_consulting' },
  { name: 'EXL', patterns: ['exl service', 'exlservice'], category: 'big4_consulting' },
  { name: 'Hexaware', patterns: ['hexaware'], category: 'big4_consulting' },
  { name: 'Birlasoft', patterns: ['birlasoft'], category: 'big4_consulting' },
  { name: 'Zensar', patterns: ['zensar'], category: 'big4_consulting' },
  { name: 'Sonata Software', patterns: ['sonata software'], category: 'big4_consulting' },
  { name: 'Cyient', patterns: ['cyient'], category: 'big4_consulting' },
  { name: 'KPIT', patterns: ['kpit'], category: 'big4_consulting' },
  { name: 'Virtusa', patterns: ['virtusa'], category: 'big4_consulting' },
  { name: 'Nagarro', patterns: ['nagarro'], category: 'big4_consulting' },
  { name: 'Publicis Sapient', patterns: ['publicis sapient', 'sapient'], category: 'big4_consulting' },
  { name: 'Capco', patterns: ['capco'], category: 'big4_consulting' },
];

/**
 * All unique patterns flattened and lowercased for fast lookup.
 */
const ALL_PATTERNS: { pattern: string; name: string; category: CompanyEntry['category'] }[] =
  COMPANIES.flatMap((c) =>
    c.patterns.map((p) => ({ pattern: p.toLowerCase().trim(), name: c.name, category: c.category })),
  );

/**
 * Normalise a string for word-boundary matching: lowercase, replace every
 * non-alphanumeric run with a single space, and pad with spaces on both ends.
 * This lets us match whole tokens/phrases and AVOID false positives like
 * "ola" matching "Coca-Cola" or "visa" matching "Visakhapatnam".
 */
function normalize(s: string): string {
  return ` ${s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim()} `;
}

/**
 * Check if a company name matches any top MNC pattern.
 * Returns the matched company info or null.
 *
 * Uses WORD-BOUNDARY matching: the pattern must appear as a complete token
 * sequence (surrounded by spaces), not just as a substring. So "tcs" matches
 * "TCS Limited" but NOT "Matchstics", and "ola" matches "Ola Electric" but
 * NOT "Coca-Cola".
 */
export function matchTopCompany(
  companyName: string | null | undefined,
): { name: string; category: CompanyEntry['category'] } | null {
  if (!companyName) return null;
  const hay = normalize(companyName);
  for (const { pattern, name, category } of ALL_PATTERNS) {
    const needle = ` ${pattern.replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim()} `;
    if (needle !== '  ' && hay.includes(needle)) {
      return { name, category };
    }
  }
  return null;
}

/**
 * Check if a company name is a top MNC (boolean shorthand).
 */
export function isTopCompany(companyName: string | null | undefined): boolean {
  return matchTopCompany(companyName) !== null;
}

/**
 * Get all company patterns as a flat array (for SQL ILIKE queries).
 * Each pattern is wrapped with % for substring matching.
 */
export function getTopCompanyPatterns(): string[] {
  return ALL_PATTERNS.map((p) => `%${p.pattern}%`);
}

/**
 * Category labels for display.
 */
export const CATEGORY_LABELS: Record<CompanyEntry['category'], string> = {
  fortune500_tech: 'Fortune 500 Tech',
  fortune500_finance: 'Fortune 500 Finance',
  big4_consulting: 'Big 4 & Consulting',
  indian_mnc: 'Indian MNC',
  global_product: 'Global Product',
  unicorn_india: 'Indian Unicorn',
};

export type { CompanyEntry };

/** Stable slug for dream-company picks (e.g. "Google" → "google"). */
export function companyCatalogKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Full curated catalog for dream-company picker UI. */
export function getCompanyCatalog(): readonly CompanyEntry[] {
  return COMPANIES;
}

export function findCatalogCompanyByKey(key: string): CompanyEntry | null {
  const normalized = key.trim().toLowerCase();
  return COMPANIES.find((c) => companyCatalogKey(c.name) === normalized) ?? null;
}

/** True when job company matches one catalog entry's patterns (word-boundary). */
export function matchJobToCatalogEntry(
  companyName: string | null | undefined,
  entry: CompanyEntry,
): boolean {
  if (!companyName) return false;
  const hay = normalize(companyName);
  for (const pattern of entry.patterns) {
    const needle = ` ${pattern.replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim()} `;
    if (needle !== '  ' && hay.includes(needle)) return true;
  }
  return false;
}
