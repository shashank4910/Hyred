/**
 * ATS Resume Checker — pure deterministic scoring engine.
 *
 * Zero LLM calls, zero external API costs. Every check is regex / heuristic
 * based on 2026 ATS best practices (Workday, Taleo, Greenhouse, Lever, iCIMS).
 *
 * All scores are 0–100, weighted to produce an overall 0–100 score.
 */

/* ------------------------------------------------------------------ */
/*  Public types                                                       */
/* ------------------------------------------------------------------ */

export interface AtsCheckResult {
  overallScore: number;
  breakdown: {
    sectionStructure: CriterionResult;
    contactInfo: CriterionResult;
    bulletQuality: CriterionResult;
    quantifiableAchievements: CriterionResult;
    skillsOptimization: CriterionResult;
    lengthReadability: CriterionResult;
    formatCleanliness: CriterionResult;
    dateConsistency: CriterionResult;
  };
  topImprovements: string[];
  detectedIssues: string[];
  goodPractices: string[];
  /** Resume stats */
  stats: ResumeStats;
  /**
   * How well the engine could read the resume's structure. When 'degraded',
   * layout-dependent criteria are down-weighted and a warning is surfaced —
   * the low-level scores reflect the extractor, not necessarily the resume.
   */
  parseQuality: ParseQuality;
  /** Human-readable note when parseQuality is not 'good'. */
  parseWarning?: string;
  /** JD keyword match (only if jobDescription was provided) */
  jdMatch?: JdMatchResult;
  /** File-level hints only available when the raw file is provided */
  fileHints?: FileHints;
}

export interface FileHints {
  extension: string;
  isPdf: boolean;
  isDocx: boolean;
  isTxt: boolean;
  /** True if parsed text is suspiciously short (<100 chars) — might be scanned/image PDF */
  mightBeScanned: boolean;
  /** Format quality recommendation: 'best' | 'good' | 'poor' | 'unknown' */
  formatQuality?: 'best' | 'good' | 'poor' | 'unknown';
  /** Human-readable format advice */
  formatAdvice?: string;
}

export interface CriterionResult {
  score: number;    // 0–100
  weight: number;   // contribution to overall (all weights sum to 100)
  feedback: string;
}

export interface ResumeStats {
  wordCount: number;
  charCount: number;
  bulletCount: number;
  sectionCount: number;
}

export interface JdMatchResult {
  /** Keywords found in BOTH the resume and JD */
  matched: string[];
  /** Keywords in the JD but NOT found in the resume */
  missing: string[];
  /** Keywords in the resume but NOT in the JD */
  extra: string[];
  /** Match score 0–100 */
  matchScore: number;
}

/* ------------------------------------------------------------------ */
/*  Constants — standard ATS-friendly section headers                  */
/* ------------------------------------------------------------------ */

const STANDARD_HEADERS = [
  // Summary / Objective
  /^(professional\s+)?summary$/i,
  /^summary\s+of\s+qualifications$/i,
  /^(career\s+)?objective$/i,
  /^profile$/i,
  /^professional\s+profile$/i,
  // Experience
  /^(professional\s+)?(work\s+)?experience$/i,
  /^employment$/i,
  /^work\s+history$/i,
  /^career\s+history$/i,
  /^relevant\s+experience$/i,
  // Education
  /^education$/i,
  /^education\s+and\s+training$/i,
  /^degrees?$/i,
  /^academic\s+(background|qualifications)$/i,
  // Skills
  /^(technical\s+)?skills$/i,
  /^technical\s+competencies$/i,
  /^core\s+competencies$/i,
  /^areas?\s+of\s+expertise$/i,
  /^key\s+skills$/i,
  /^(soft|interpersonal)\s+skills$/i,
  // Certifications
  /^certifications$/i,
  /^(professional\s+)?certifications$/i,
  /^certificates$/i,
  /^licenses?$/i,
  /^licenses?\s+and\s+certifications$/i,
  // Projects
  /^projects$/i,
  /^key\s+projects$/i,
  // Publications
  /^publications$/i,
  /^research$/i,
  // Languages
  /^languages$/i,
  // Additional
  /^(additional|other)\s+(information|details|activities)$/i,
  /^(volunteer|community)\s+(experience|work)$/i,
  /^awards?\s+(and\s+)?(honours|honors)?$/i,
  /^interests$/i,
  /^references$/i,
  /^achievements?$/i,
  /^accomplishments?$/i,
];

const REQUIRED_HEADERS = [
  /^(professional\s+)?(work\s+)?experience$/i,
  /^education$/i,
];

const STRONGLY_RECOMMENDED_HEADERS = [
  /^(technical\s+)?skills$/i,
  /^(professional\s+)?summary$/i,
];/* ------------------------------------------------------------------ */
/*  Helpers */
/* ------------------------------------------------------------------ */

/** Extract all lines that look like section headers (ALL-CAPS or Title Case on their own line). */
function findSectionHeaders(lines: string[]): string[] {
  const headers: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const t = normalizeHeaderLine(lines[i]);
    if (!t) continue;
    // ALL-CAPS header (2+ words or 5+ chars): "PROFESSIONAL EXPERIENCE", "EDUCATION"
    if (/^[A-Z][A-Z\s&/.-]+$/.test(t) && t.length >= 5) {
      headers.push(t);
      continue;
    }
    // Title Case header: "Professional Experience", "Technical Skills"
    // Also handles headers with special chars like "AI/ML Skills", "C++ Developer"
    if (
      /^[A-Z][A-Za-z0-9\/#&.'\-+_]*(?:\s+[A-Z][A-Za-z0-9\/#&.'\-+_]*)*$/.test(t) &&
      /[a-z]/.test(t) &&
      t.length >= 5 &&
      t.split(/\s+/).length >= 2
    ) {
      headers.push(t);
    }
  }
  return headers;
}

/** Check if a header matches any of the standard patterns. */
function isStandardHeader(header: string, patterns: RegExp[]): boolean {
  return patterns.some((re) => re.test(header.trim()));
}

function normalizeHeaderLine(line: string): string {
  return line.trim().replace(/[:：]\s*$/, '');
}

/** Strip trailing colon/em-dash from a section header line. */
function lineMatchesHeader(line: string, header: string): boolean {
  const t = normalizeHeaderLine(line);
  const h = normalizeHeaderLine(header);
  return t === h || t.startsWith(`${h}:`) || t.startsWith(`${h} —`) || t.startsWith(`${h} -`);
}

function looksLikePersonName(t: string): boolean {
  if (t.length < 3 || t.length > 60) return false;
  // ALL CAPS: JOHN SMITH, RAJESH KUMAR
  if (/^[A-Z]{2,}(?:\s+[A-Z]{2,})+$/.test(t)) return true;
  // Title Case with optional honorific: Dr. Priya Sharma, John A. Smith
  return /^(?:Dr\.|Mr\.|Ms\.|Mrs\.)?\s*[A-Z][a-zA-Z'.\-]+(?:\s+[A-Z][a-zA-Z'.\-]+)+$/.test(t);
}

/** Find the first line that looks like a candidate name (top of resume, non-empty, not a header). */
function findNameLine(lines: string[]): string | null {
  for (let i = 0; i < Math.min(lines.length, 10); i++) {
    let t = lines[i].trim();
    if (!t) continue;
    // Skip header labels like "RESUME", "CV", "CURRICULUM VITAE"
    if (/^(resume|cv|curriculum\s+vitae|profile)$/i.test(t)) continue;

    // Pipe-separated contact line: "Rajesh Kumar | raj@email.com | +91..."
    if (t.includes('|')) {
      const nameSeg = t.split('|').map((s) => s.trim()).find(
        (seg) => !/@/.test(seg) && !/^\+?\d/.test(seg) && !/linkedin/i.test(seg) && looksLikePersonName(seg),
      );
      if (nameSeg) return nameSeg;
      continue;
    }

    // Name before email on same line: "John Smith john@email.com"
    if (/@/.test(t)) {
      const beforeEmail = t.replace(/\s+[a-zA-Z0-9._%+-]+@[^\s]+.*$/, '').trim();
      if (beforeEmail && looksLikePersonName(beforeEmail)) return beforeEmail;
      continue;
    }

    if (/^\+?\d[\d\s().-]{6,}/.test(t)) continue;

    if (looksLikePersonName(t)) return t;
  }
  return null;
}

/**
 * Collect bullet-point lines from the text.
 * Detects multiple bullet formats for resilient parsing across file types (PDF, DOCX, TXT).
 */
function findBulletLines(lines: string[]): string[] {
  // Common bullet characters that may survive parsing
  const bulletChars = '-•*→⁃▪▸▹►‣⁌⁍∙○●•‣';
  const bulletRegex = new RegExp(`^[${bulletChars}]`);
  return lines.filter((l) => {
    const t = l.trim();
    if (!t) return false;
    // Starts with a bullet character (any of the known unicode bullets)
    if (bulletRegex.test(t)) return true;
    // Starts with a digit followed by period or paren (numbered lists like "1." or "1)")
    if (/^\d+[.)]\s/.test(t)) return true;
    // Starts with a pipe or bracket (common in table-structured resumes)
    if (/^[\[|]/.test(t) && t.length > 10) return true;
    return false;
  });
}

/* ------------------------------------------------------------------ */
/*  Input normalization — reflow flattened resume text                  */
/* ------------------------------------------------------------------ */

/**
 * Known section-header words. Used to re-insert line breaks when a resume
 * has been flattened to few/no newlines (a common PDF-extraction artifact).
 */
const SECTION_WORDS =
  '(?:professional\\s+summary|summary\\s+of\\s+qualifications|career\\s+objective|' +
  'professional\\s+profile|professional\\s+experience|work\\s+experience|work\\s+history|' +
  'career\\s+history|relevant\\s+experience|employment|education\\s+and\\s+training|' +
  'education|academic\\s+background|technical\\s+skills|technical\\s+competencies|' +
  'core\\s+competencies|areas?\\s+of\\s+expertise|key\\s+skills|professional\\s+certifications|' +
  'certifications?|licenses?|key\\s+projects|projects?|publications|research|languages|' +
  'awards?|achievements?|accomplishments?|interests|references|volunteer\\s+experience|' +
  'summary|profile|skills|experience)';

/**
 * Detects whether parsed text has lost its line structure and, if so, reflows
 * it into lines by re-inserting breaks before section headers and bullet markers.
 *
 * This is the single biggest source of bogus low scores: when a PDF/text dump
 * collapses to one giant line, every line-based detector (headers, bullets,
 * multi-column) reads near-zero through no fault of the resume.
 */
function reflowFlattenedText(text: string): { text: string; wasReflowed: boolean } {
  const lines = text.split('\n');
  const nonEmpty = lines.filter((l) => l.trim().length > 0);
  const wordCount = text.split(/\s+/).filter(Boolean).length;
  const avgWordsPerLine = nonEmpty.length > 0 ? wordCount / nonEmpty.length : wordCount;

  // Heuristic: substantial content but very few lines, OR lines are huge on
  // average (>25 words/line) — both indicate lost line structure.
  const looksFlattened =
    wordCount >= 80 && (nonEmpty.length <= 3 || avgWordsPerLine > 25);

  if (!looksFlattened) {
    return { text, wasReflowed: false };
  }

  let out = text;

  // 1. Break before inline section headers ("...experience. PROFESSIONAL EXPERIENCE Led...")
  const headerRe = new RegExp(`\\s+(?=${SECTION_WORDS}\\b\\s*[:•*-]?)`, 'gi');
  out = out.replace(headerRe, '\n');

  // 2. Break before common inline bullet markers (" * ", " • ", " - " between words)
  out = out.replace(/\s+(?=[•▪▸‣◦*]\s)/g, '\n');
  out = out.replace(/\s+-\s+(?=[A-Z])/g, '\n- ');

  // 3. Break before a date range that starts an entry ("... 2018 - 2021 ...")
  out = out.replace(/\s+(?=(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{4}\b)/gi, '\n');

  return { text: out, wasReflowed: true };
}

/**
 * Parse-quality assessment. Tells the caller whether the engine could read
 * the resume's structure well enough to trust the layout-dependent criteria.
 */
export type ParseQuality = 'good' | 'degraded' | 'unreadable';

function assessParseQuality(text: string): ParseQuality {
  const nonEmpty = text.split('\n').filter((l) => l.trim().length > 0);
  const wordCount = text.split(/\s+/).filter(Boolean).length;
  const headers = findSectionHeaders(text.split('\n'));

  if (wordCount < 50) return 'unreadable';
  // No detectable headers AND content crammed into very few lines → degraded.
  if (headers.length === 0 && nonEmpty.length <= 5 && wordCount > 120) return 'degraded';
  if (headers.length === 0 && nonEmpty.length <= 8) return 'degraded';
  return 'good';
}

/* ------------------------------------------------------------------ */
/*  Scoring functions (each returns 0-100 and feedback)                 */
/* ------------------------------------------------------------------ */

/** Short, action-first tip from detected issues (no "Needs improvement…" filler). */
function tipFromIssues(issues: string[], fallback: string, max = 2): string {
  if (issues.length === 0) return fallback;
  return issues.slice(0, max).join(' ');
}

/** Avoid mid-word truncation in UI cards. */
function clipAtWord(text: string, max: number): string {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  if (cleaned.length <= max) return cleaned;
  const cut = cleaned.slice(0, max);
  const space = cut.lastIndexOf(' ');
  return `${(space > Math.floor(max * 0.5) ? cut.slice(0, space) : cut).trimEnd()}…`;
}

function joinEnglish(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? '';
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return `${parts.slice(0, -1).join(', ')}, and ${parts[parts.length - 1]}`;
}

/**
 * Short human action for the "Fix these first" card.
 * Prefer one clear next step over concatenated diagnostic sentences.
 */
function humanActionTip(
  key: keyof AtsCheckResult['breakdown'],
  feedback: string,
): string {
  if (key === 'sectionStructure') {
    const missing: string[] = [];
    if (/Missing both Experience and Education/i.test(feedback)) {
      missing.push('Experience', 'Education');
    } else {
      if (/Missing Experience/i.test(feedback)) missing.push('Experience');
      if (/Missing Education/i.test(feedback)) missing.push('Education');
    }
    if (/Missing both Skills and Summary/i.test(feedback)) {
      missing.push('Skills', 'Summary');
    } else {
      if (/Missing Skills/i.test(feedback)) missing.push('Skills');
      if (/Missing Summary/i.test(feedback)) missing.push('Summary');
    }
    if (missing.length > 0) {
      return `Add ${joinEnglish(missing)} section headers.`;
    }
    return 'Use clear section headers ATS recognizes (Experience, Education, Skills).';
  }

  if (key === 'contactInfo') {
    if (/No clear name/i.test(feedback) && /Email address missing/i.test(feedback)) {
      return 'Put your name, email, and phone near the top.';
    }
    if (/Email address missing/i.test(feedback)) return 'Add a clear email near the top.';
    if (/Phone number missing/i.test(feedback)) return 'Add a phone number near the top.';
    if (/No clear name/i.test(feedback)) return 'Put your full name on the first line.';
    if (/LinkedIn URL missing/i.test(feedback)) return 'Add your LinkedIn URL near the top.';
    return 'Put name, email, and phone in the top few lines.';
  }

  if (key === 'bulletQuality') {
    if (/No bullet/i.test(feedback)) {
      return 'Rewrite experience as "- " bullets ATS can read.';
    }
    return 'Use consistent "- " bullets with enough detail.';
  }

  if (key === 'quantifiableAchievements') {
    if (/No experience bullets/i.test(feedback)) {
      return 'Add experience bullets that include numbers or scale.';
    }
    return 'Add numbers to more bullets (%, $, time, or team size).';
  }

  if (key === 'skillsOptimization') {
    return 'Add a Skills section with role keywords.';
  }

  if (key === 'lengthReadability') {
    return 'Keep the resume focused — about 1–2 pages.';
  }

  if (key === 'formatCleanliness') {
    return 'Replace fancy quotes and symbols with plain text.';
  }

  if (key === 'dateConsistency') {
    return 'Use consistent dates like Jan 2021 – Present.';
  }

  return clipAtWord(feedback, 110);
}

function scoreSectionStructure(text: string): CriterionResult {
  const lines = text.split('\n');
  const headers = findSectionHeaders(lines);
  // Find which ACTUAL header strings matched each required/recommended pattern
  const matchedRequired = REQUIRED_HEADERS
    .map((re) => headers.find((h) => re.test(h)))
    .filter((h): h is string => h !== undefined);
  const matchedRecommended = STRONGLY_RECOMMENDED_HEADERS
    .map((re) => headers.find((h) => re.test(h)))
    .filter((h): h is string => h !== undefined);

  // Check for non-standard headers
  const nonStandardCount = headers.filter((h) => {
    const trimmed = h.trim().toLowerCase();
    // If it doesn't match any standard pattern
    return !STANDARD_HEADERS.some((re) => re.test(trimmed));
  }).length;

  // Check ordering: Experience should come before Education (common best practice)
  const expIdx = headers.findIndex((h) => /experience/i.test(h));
  const eduIdx = headers.findIndex((h) => /education/i.test(h));
  const orderNote = expIdx >= 0 && eduIdx >= 0 && eduIdx < expIdx
    ? 'Education appears before Experience (unusual ordering).'
    : null;

  let score = 0;
  const issues: string[] = [];
  const good: string[] = [];

  // Required headers: -40 if missing both, -20 if missing one
  if (matchedRequired.length === 2) {
    score += 50;
    good.push('Both Experience and Education sections present.');
  } else if (matchedRequired.length === 1) {
    const foundHeader = matchedRequired[0].toLowerCase();
    const missing = foundHeader.includes('education') ? 'Experience' : 'Education';
    score += 25;
    issues.push(`Missing ${missing} section.`);
  } else {
    issues.push('Missing both Experience and Education sections.');
  }

  // Recommended headers: +15 each
  if (matchedRecommended.length >= 2) {
    score += 30;
    good.push('Has Skills and Summary/Objective sections.');
  } else if (matchedRecommended.length === 1) {
    const foundHeader = matchedRecommended[0].toLowerCase();
    const label = foundHeader.includes('skills') || foundHeader.includes('competencies') || foundHeader.includes('expertise') ? 'Skills' : 'Summary';
    score += 15;
    issues.push(`Missing ${label === 'Skills' ? 'Summary' : 'Skills'} section (only has ${label}).`);
  } else {
    issues.push('Missing both Skills and Summary sections.');
  }

  // Non-standard headers penalty
  if (nonStandardCount > 2) {
    score -= 15;
    issues.push(`${nonStandardCount} non-standard section headers detected — ATS may not recognize them.`);
  } else if (nonStandardCount > 0) {
    score -= 5;
  }

  // Bonus for proper standard header count
  const standardCount = headers.filter((h) => isStandardHeader(h, STANDARD_HEADERS)).length;
  if (standardCount >= 5) {
    score += 10;
    good.push('Good variety of standard sections.');
  } else if (standardCount >= 3) {
    score += 5;
  }

  // Ordering note
  if (orderNote) issues.push(orderNote);

  score = Math.max(0, Math.min(100, score));

  return {
    score,
    weight: 20,
    feedback: score >= 80
      ? 'Clear Experience, Education, and related headers.'
      : tipFromIssues(issues, 'Add standard Experience, Education, Skills, and Summary headers.'),
  };
}

function scoreContactInfo(text: string): CriterionResult {
  const first20Lines = text.split('\n').slice(0, 20).join('\n');

  const hasEmail = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/.test(first20Lines);
  const hasPhone =
    /(\+?\d[\d\s().-]{7,})/.test(first20Lines)
    || /\+91[\s-]?\d{10}\b/.test(first20Lines)
    || /\b[6-9]\d{9}\b/.test(first20Lines);
  const hasLinkedIn = /linkedin\.com\/in\//i.test(first20Lines);
  const hasGithub = /github\.com\//i.test(first20Lines);
  const hasUSLocation = /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*,\s*[A-Z]{2}\b/.test(first20Lines);
  const hasIndiaLocation =
    /\b(?:Bangalore|Bengaluru|Mumbai|Delhi|Noida|Gurgaon|Gurugram|Pune|Chennai|Hyderabad|Kolkata|Ahmedabad|Jaipur|Indore|Kochi|Coimbatore|Chandigarh|Visakhapatnam|Lucknow|Bhopal)\b/i.test(first20Lines)
    || /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*,\s*(?:Karnataka|Maharashtra|Telangana|Tamil Nadu|Uttar Pradesh|Haryana|Gujarat|Rajasthan|Madhya Pradesh|Kerala|West Bengal|India|NCR)\b/i.test(first20Lines);
  const hasLocation = hasUSLocation || hasIndiaLocation
    || /\b(city|town|village)\s+of\b/i.test(first20Lines);

  // Check name at top
  const lines = text.split('\n');
  const firstNameLine = findNameLine(lines);
  const hasName = firstNameLine !== null;

  // --- Header/Footer position check ---
  // Workday, SuccessFactors, SmartRecruiters, Bullhorn may skip content in
  // document headers/footers. Check if contact info appears suspiciously
  // isolated at the top or bottom of the text.
  const firstContentLine = lines.findIndex((l) => l.trim().length > 0);
  const firstSectionHeaderIdx = lines.findIndex((l) => {
    const t = l.trim();
    return t.length >= 5 && (/^[A-Z][A-Z\s&/.-]+$/.test(t) || isStandardHeader(t, STANDARD_HEADERS));
  });
  const gapBeforeFirstSection = firstSectionHeaderIdx > 0
    ? lines.slice(firstContentLine, firstSectionHeaderIdx).filter((l) => l.trim().length === 0).length
    : 0;
  const contactInHeader = gapBeforeFirstSection >= 3 && hasName && firstSectionHeaderIdx > 0;

  // Check if contact info appears in last few lines (footer risk)
  const lastLines = lines.slice(-5).filter((l) => l.trim().length > 0).join(' ').toLowerCase();
  const contactInFooter = (hasEmail || hasPhone) &&
    lines.length > 30 &&
    lastLines.length > 0 &&
    (lastLines.includes('@') || lastLines.includes('linkedin'));

  let score = 0;
  const issues: string[] = [];
  const good: string[] = [];

  // Name: -25 if missing
  if (hasName) {
    score += 25;
    good.push('Name clearly present at top.');
  } else {
    issues.push('No clear name found at top of resume.');
  }

  // Email: -20 if missing
  if (hasEmail) {
    score += 20;
    good.push('Email address present.');
  } else {
    issues.push('Email address missing.');
  }

  // Phone: -20 if missing
  if (hasPhone) {
    score += 20;
    good.push('Phone number present.');
  } else {
    issues.push('Phone number missing.');
  }

  // LinkedIn: -15 if missing (for tech roles this is important)
  if (hasLinkedIn) {
    score += 15;
    good.push('LinkedIn profile URL included.');
  } else {
    issues.push('LinkedIn URL missing.');
  }

  // Location: -10 if missing
  if (hasLocation) {
    score += 10;
    good.push('Location (city, region) present.');
  } else {
    issues.push('Location not clearly found. Add City, State/Country near the top.');
  }

  // Bonus for GitHub (tech roles)
  if (hasGithub) score += 10;

  // Header/Footer penalties
  if (contactInHeader) {
    score -= 15;
    issues.push('Contact info appears isolated at the top — likely in a document header zone. Workday, SuccessFactors, and SmartRecruiters may skip headers/footers. Move contact info into the main body.');
  }
  if (contactInFooter) {
    score -= 15;
    issues.push('Contact info detected near the end of the document — likely in a footer zone. Many ATS parsers skip footers. Move contact info to the top of the main body.');
  }

  score = Math.max(0, Math.min(100, score));

  return {
    score,
    weight: 15,
    feedback: score >= 80
      ? 'Name, email, and phone are easy to find at the top.'
      : tipFromIssues(issues, 'Put name, email, and phone near the top of the resume.'),
  };
}

function scoreBulletQuality(text: string): CriterionResult {
  const lines = text.split('\n');
  const bullets = findBulletLines(lines);

  if (bullets.length === 0) {
    return {
      score: 10,
      weight: 15,
      feedback: 'No bullet points found. Use "- " formatted bullets for better ATS readability.',
    };
  }

  // Check bullet character consistency
  const otherBullets = bullets.filter((l) => /^\s*[•*→\d]/.test(l.trim()) && !/^\s*-/.test(l.trim()));

  const consistent = otherBullets.length === 0;
  const mixed = otherBullets.length > 0 && otherBullets.length < bullets.length * 0.3;

  // Check bullets have meaningful content (not just 1-2 words)
  const shortBullets = bullets.filter((l) => l.trim().replace(/^[-•*→\d.]+\s*/, '').split(/\s+/).length < 4);
  const goodBullets = bullets.length - shortBullets.length;

  // Bullets per section (rough)
  const sections = findSectionHeaders(lines);
  const expSectionIdx = sections.findIndex((h) => /experience/i.test(h));
  const nextSectionIdx = expSectionIdx >= 0
    ? sections.slice(expSectionIdx + 1).findIndex((h) => /education|skills|projects|certifications/i.test(h))
    : -1;
  const expEndIdx = nextSectionIdx >= 0
    ? lines.findIndex((l) => l.trim() === sections[expSectionIdx + 1 + nextSectionIdx])
    : lines.length;

  const expLines = expSectionIdx >= 0
    ? lines.slice(
        lines.findIndex((l) => l.trim() === sections[expSectionIdx]),
        expEndIdx > 0 ? expEndIdx : lines.length,
      )
    : [];
  const expBullets = findBulletLines(expLines);

  let score = 0;
  const issues: string[] = [];
  const good: string[] = [];

  // Consistency: -25 if very mixed, -10 if slightly mixed
  if (consistent) {
    score += 30;
    good.push('Bullet points use consistent format.');
  } else if (mixed) {
    score += 20;
    issues.push('Some bullets use non-standard characters (•, *, →). Stick to "- " for all.');
  } else {
    score += 5;
    issues.push(`Mixed bullet formats detected (${otherBullets.length} use non-standard symbols).`);
  }

  // Enough bullets overall: +30 for 15+, +20 for 10+, +10 for 5+
  if (bullets.length >= 15) {
    score += 30;
    good.push('Good number of bullet points across resume.');
  } else if (bullets.length >= 10) {
    score += 20;
  } else if (bullets.length >= 5) {
    score += 10;
  } else {
    issues.push('Very few bullet points. Add more detail to your experience.');
  }

  // Good bullets (not too short): +25 if most are substantive
  if (goodBullets >= bullets.length * 0.7) {
    score += 25;
    good.push('Bullet points are substantive and descriptive.');
  } else if (goodBullets >= bullets.length * 0.4) {
    score += 15;
    issues.push(`${shortBullets.length} bullet points are too short (< 4 words).`);
  } else {
    issues.push('Many bullet points are too short. Add more detail.');
  }

  // Experience section bullets: +15 if 5+
  if (expBullets.length >= 5) {
    score += 15;
    good.push('Strong bullet coverage in Experience section.');
  } else if (expBullets.length >= 3) {
    score += 10;
  } else {
    issues.push('Experience section has few bullet points.');
  }

  score = Math.max(0, Math.min(100, score));

  return {
    score,
    weight: 15,
    feedback: score >= 80
      ? 'Bullets are consistent and easy for ATS to read.'
      : tipFromIssues(issues, 'Use clear "- " bullets with enough detail in each line.'),
  };
}

function scoreQuantifiableAchievements(text: string): CriterionResult {
  const lines = text.split('\n');
  const bullets = findBulletLines(lines);

  if (bullets.length === 0) {
    return {
      score: 15,
      weight: 15,
      feedback: 'No experience bullets found to check for quantifiable achievements.',
    };
  }

  // Count bullets with numbers (excluding dates and years)
  const datePattern = /\b(19|20)\d{2}\b/;
  const numberInBullet = bullets.filter((b) => {
    const afterPrefix = b.replace(/^\s*[-•*→\d.]+\s*/, '');
    // Must have a number, and it must not be JUST a year
    const hasNumber = /\d/.test(afterPrefix);
    const isOnlyDate = datePattern.test(afterPrefix) && !/[%$%,.\d]{2,}/.test(afterPrefix.replace(datePattern, ''));
    return hasNumber && !isOnlyDate;
  });

  const percentBullets = bullets.filter((b) => /%/.test(b));
  const dollarBullets = bullets.filter((b) => /\$/.test(b));
  const metricBullets = bullets.filter((b) =>
    /\b(\d+[xX]|\d{2,}\s*%|\$\s*[\d,]+|improved|increased|decreased|reduced|generated|saved|managed|led|delivered|achieved|grew|boosted|drove|optimized|accelerated|automated|scaled)\b/i.test(b),
  );

  let score = 0;
  const issues: string[] = [];
  const good: string[] = [];

  // Percentage in bullets: +30 if 2+, +15 if 1
  if (percentBullets.length >= 2) {
    score += 30;
    good.push('Uses percentages to show impact.');
  } else if (percentBullets.length === 1) {
    score += 15;
  }

  // Dollar amounts: +20 if 1+
  if (dollarBullets.length >= 1) {
    score += 20;
    good.push('Includes monetary/financial impact.');
  }

  // Action verbs + metrics: +25 if 3+, +15 if 1-2
  if (metricBullets.length >= 3) {
    score += 30;
    good.push('Strong use of action verbs with measurable outcomes.');
  } else if (metricBullets.length >= 1) {
    score += 15;
  } else {
    issues.push('No strong action verbs or measurable outcomes detected.');
  }

  // Overall ratio of quantified bullets
  const ratio = numberInBullet.length / bullets.length;
  if (ratio >= 0.4) {
    score += 20;
    good.push(`High ratio (${Math.round(ratio * 100)}%) of quantified achievements.`);
  } else if (ratio >= 0.2) {
    score += 10;
  } else {
    issues.push(`Only ${numberInBullet.length}/${bullets.length} bullets contain metrics or numbers.`);
  }

  score = Math.max(0, Math.min(100, score));

  return {
    score,
    weight: 15,
    feedback: score >= 80
      ? 'Experience bullets include clear numbers and results.'
      : tipFromIssues(issues, 'Add numbers, %, or scale to more experience bullets.', 1),
  };
}

function scoreSkillsOptimization(text: string): CriterionResult {
  const lines = text.split('\n');
  const headers = findSectionHeaders(lines);

  // Find skills section
  const skillsHeaderIdx = headers.findIndex((h) =>
    /^(technical\s+)?skills|core\s+competencies|areas?\s+of\s+expertise|key\s+skills/i.test(h.trim()),
  );

  if (skillsHeaderIdx < 0) {
    return {
      score: 15,
      weight: 15,
      feedback: 'No Skills section found — add one with role keywords ATS can match.',
    };
  }

  // Find the skills header in the original lines, then scan forward to the next section
  const skillHeaderName = headers[skillsHeaderIdx];
  const startLine = lines.findIndex((l) => lineMatchesHeader(l, skillHeaderName));
  let endLine = lines.length;
  // Scan forward from skills section until we hit another ALL-CAPS header
  for (let i = startLine + 1; i < lines.length; i++) {
    const t = lines[i].trim();
    if (
      t.length >= 5 &&
      (/^[A-Z][A-Z\s&/.-]+$/.test(t) ||
       /^[A-Z][a-z]+(\s+[A-Z][a-z]+)*$/.test(t)) &&
      t !== skillHeaderName &&
      STANDARD_HEADERS.some((re) => re.test(t))
    ) {
      endLine = i;
      break;
    }
  }

  const skillLines = lines.slice(startLine + 1, endLine).filter((l) => l.trim());
  const skillText = skillLines.join(' ');

  // Count individual skills (comma-separated items)
  const skillItems = skillText
    .split(/[,;|]/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 2 && s.length <= 50);

  // Filter out soft skills (non-technical)
  const softSkills = new Set([
    'communication', 'teamwork', 'leadership', 'problem solving',
    'time management', 'critical thinking', 'creativity',
    'collaboration', 'adaptability', 'organization', 'multitasking',
    'self-motivated', 'detail-oriented', 'interpersonal',
    'presentation', 'decision making', 'conflict resolution',
    'emotional intelligence', 'team player', 'work ethic',
    'analytical thinking', 'strategic thinking', 'negotiation',
  ]);

  const concreteSkills = skillItems.filter(
    (s) => !softSkills.has(s.toLowerCase()),
  );
  const softSkillCount = skillItems.length - concreteSkills.length;

  let score = 0;
  const issues: string[] = [];
  const good: string[] = [];

  // Number of skills: +30 if 15+, +20 if 10+, +10 if 5+
  if (concreteSkills.length >= 15) {
    score += 30;
    good.push(`Strong skills section with ${concreteSkills.length} concrete skills.`);
  } else if (concreteSkills.length >= 10) {
    score += 20;
  } else if (concreteSkills.length >= 5) {
    score += 10;
  } else {
    issues.push(`Only ${concreteSkills.length} concrete technical skills listed. Aim for 10-15.`);
  }

  // Soft skills ratio: -15 if too many soft skills
  if (softSkillCount > 0 && softSkillCount > concreteSkills.length * 0.5) {
    score -= 15;
    issues.push(`High ratio of soft skills (${softSkillCount}). ATS prefers concrete technical keywords.`);
  } else if (softSkillCount > 0 && softSkillCount > concreteSkills.length * 0.25) {
    score -= 5;
  }

  // Skills organized by category? (look for ":" patterns in skill lines)
  const categorizedLines = skillLines.filter((l) => /^[A-Za-z][A-Za-z0-9 &/+().'-]*:/.test(l.trim()));
  if (categorizedLines.length >= 3) {
    score += 20;
    good.push('Skills well-organized by category.');
  } else if (categorizedLines.length >= 1) {
    score += 10;
  }

  // Bonus for having a clean, dense skills section with enough items
  if (concreteSkills.length >= 10 && skillLines.length >= 2) {
    score += 5;
  }

  // Skills appear in experience bullets (contextualization)
  const bulletLines = findBulletLines(lines);
  const bulletText = bulletLines.join(' ').toLowerCase();
  // Pre-compile skill section pattern for reuse
  const skillSectionPattern = /^(?:(?:technical\s+)?skills|core\s+competencies|areas?\s+of\s+expertise|key\s+skills)/i;

  const skillContextualized = concreteSkills.filter((skill) => {
    const lower = skill.toLowerCase();
    if (keywordInText(bulletText, lower)) return true;
    return lines.some((line) => {
      const trimmed = line.trim();
      if (!keywordInText(trimmed, lower)) return false;
      if (trimmed.length <= 20) return false;
      if (skillSectionPattern.test(trimmed)) return false;
      return true;
    });
  });

  const contextualizedRatio = concreteSkills.length > 0
    ? skillContextualized.length / concreteSkills.length
    : 0;
  if (contextualizedRatio >= 0.3) {
    score += 25;
    good.push('Most skills are contextualized in experience descriptions (ATS-friendly).');
  } else if (contextualizedRatio >= 0.1) {
    score += 15;
  } else if (contextualizedRatio > 0) {
    score += 5;
  } else {
    issues.push('Skills appear only in the Skills section — ATS prefers them also in experience bullets.');
  }

  // Enough total lines in skills section
  if (skillLines.length < 2) {
    issues.push('Skills section is very sparse. Add more detail.');
  }

  // --- Keyword stuffing detection ---
  // Modern ATS (Greenhouse, Workday) can detect and penalize keyword stuffing.
  // Check for: unnaturally dense keyword clusters, repetition, and high density.
  const totalSkillWords = skillItems.length;
  const skillTextWords = skillText.split(/\s+/).filter(Boolean).length;
  const keywordDensity = skillTextWords > 0 ? totalSkillWords / skillTextWords : 0;

  // High density (>0.5 means more than half the words are comma-separated items)
  if (keywordDensity > 0.7 && totalSkillWords > 15) {
    score -= 15;
    issues.push(`Very high keyword density (${Math.round(keywordDensity * 100)}% keywords). ATS may flag this as keyword stuffing — spread skills naturally into experience bullets.`);
  } else if (keywordDensity > 0.5 && totalSkillWords > 20) {
    score -= 5;
    issues.push(`High keyword density (${Math.round(keywordDensity * 100)}% keywords). Mix skills into experience descriptions for a more natural profile.`);
  }

  // Check for suspicious repetition of the same skill
  const lowerSkillItems = skillItems.map((s) => s.toLowerCase().trim());
  const uniqueSkills = new Set(lowerSkillItems);
  if (lowerSkillItems.length > 15 && uniqueSkills.size < lowerSkillItems.length * 0.6) {
    score -= 10;
    issues.push(`${lowerSkillItems.length - uniqueSkills.size} duplicate or near-duplicate skills detected — remove repetitions.`);
  }

  // Check for unnaturally long single-line keyword clusters (e.g., "React, Angular, Vue, Svelte, Node.js, Express, Django...")
  const longSkillLines = skillLines.filter((l) => {
    const items = l.split(/[,;|]/).filter((s) => s.trim().length > 0);
    return items.length > 10;
  });
  if (longSkillLines.length > 0) {
    issues.push(`${longSkillLines.length} skill line(s) contain 10+ comma-separated items — consider grouping by category instead.`);
  }

  score = Math.max(0, Math.min(100, score));

  return {
    score,
    weight: 15,
    feedback: score >= 80
      ? 'Skills section lists concrete keywords ATS can match.'
      : tipFromIssues(issues, 'Add a Skills section with role-relevant keywords.'),
  };
}

function scoreLengthReadability(text: string): CriterionResult {
  const lines = text.split('\n');
  const wordCount = text.split(/\s+/).filter(Boolean).length;
  const lineCount = lines.filter((l) => l.trim()).length;
  const bulletCount = findBulletLines(lines).length;
  const sectionCount = findSectionHeaders(lines).length;
  const conciseButComplete =
    wordCount >= 180 && wordCount < 400 && bulletCount >= 5 && sectionCount >= 4;

  let score = 0;
  const issues: string[] = [];
  const good: string[] = [];

  // Word count bands — ideal 350–1400; concise 180–349 OK when structure is strong.
  if (wordCount >= 350 && wordCount <= 1400) {
    score += 50;
    good.push(`Resume length is ideal (~${wordCount} words, ~1-2 pages).`);
  } else if (wordCount >= 250 && wordCount < 350) {
    score += conciseButComplete ? 45 : 38;
    if (conciseButComplete) {
      good.push(`Concise resume (~${wordCount} words) with solid structure — length is fine.`);
    } else {
      issues.push(`A bit short (~${wordCount} words). Consider adding one more role or project.`);
    }
  } else if (wordCount >= 180 && wordCount < 250) {
    score += conciseButComplete ? 42 : 32;
    if (conciseButComplete) {
      good.push(`Concise resume (~${wordCount} words) with solid structure — length is fine.`);
    } else {
      issues.push(`On the shorter side (~${wordCount} words) but acceptable for early-career.`);
    }
  } else if (wordCount > 1400 && wordCount <= 1700) {
    score += 35;
    issues.push(`Slightly long (~${wordCount} words). Consider tightening to 2 pages if possible.`);
  } else if (wordCount < 180) {
    score += 15;
    issues.push(`Very short (~${wordCount} words). ATS needs more content to match against.`);
  } else {
    score += 15;
    issues.push(`Very long (~${wordCount} words). Over 2 pages may cause ATS truncation.`);
  }

  // Line density: too many short lines = sparse content
  // Exception: entry-level / concise resumes (<400 words) naturally have sparse sections
  const shortLines = lines.filter((l) => l.trim() && l.trim().split(/\s+/).length < 3);
  const shortLineRatio = lineCount > 0 ? shortLines.length / lineCount : 0;

  if (wordCount >= 400 && shortLineRatio > 0.4) {
    score -= 15;
    issues.push('High number of short/sparse lines. Consider consolidating.');
  } else if (wordCount >= 400 && shortLineRatio > 0.2) {
    score -= 5;
  } else if (wordCount >= 400) {
    score += 10;
    good.push('Good content density.');
  }

  score = Math.max(0, Math.min(100, score));

  return {
    score,
    weight: 10,
    feedback: score >= 80
      ? 'Length and density look right for ATS screening.'
      : tipFromIssues(issues, 'Aim for a focused 1–2 page resume with clear sections.', 1),
  };
}

/**
 * Detect signs of multi-column layout in parsed plain text.
 * Multi-column resumes confuse ATS parsers (Workday, Taleo, Greenhouse, etc.)
 * because text reads left-to-right across columns, garbling content order.
 *
 * Detection signals (in order of reliability):
 * 1. Tab characters — Word/Google Docs use tabs for column alignment
 * 2. Staggered line-length patterns — alternating short/long non-bullet lines
 * 3. High proportion of very short lines that aren't bullets or headers
 */
function detectMultiColumnLayout(text: string): {
  severity: 'high' | 'medium' | 'low' | 'none';
  issues: string[];
} {
  const lines = text.split('\n');
  const contentLines = lines.filter((l) => l.trim().length > 0);
  const issues: string[] = [];

  if (contentLines.length < 10) {
    return { severity: 'none', issues: [] };
  }

  // Signal 1: Tab characters (strong indicator of column/tabular layout)
  const tabCount = (text.match(/\t/g) || []).length;
  const tabLines = lines.filter((l) => l.includes('\t')).length;
  const tabLineRatio = tabLines / contentLines.length;

  // Signal 2: Staggered line-length alternation pattern
  // In multi-column, content reads as: col1-short, col2-short, col1-short, col2-short...
  // which creates alternating short/long patterns when one column has dates and other has titles
  const shortLineThreshold = 35;

  // Filter out bullets and headers to analyze content lines
  const bodyLines = contentLines.filter((l) => {
    const t = l.trim();
    // Skip bullet points (they naturally have varying lengths)
    if (/^[-•*→⁃▪▸▹►‣⁌⁍∙○●\d.)]/.test(t)) return false;
    // Skip ALL-CAPS section headers
    if (/^[A-Z][A-Z\s&/.-]+$/.test(t) && t.length >= 5) return false;
    // Skip only STANDARD section headers (NOT generic Title Case lines like
    // company names, locations, or skill lists — those are content we want to analyze)
    if (isStandardHeader(t, STANDARD_HEADERS)) return false;
    // Skip standalone single-word lines that are clear header matches
    if (t.length <= 30 && /^(summary|profile|education|experience|projects?|skills?|certifications?|languages?|publications?|references?|objectives?|achievements?|accomplishments?|interests?|leadership|awards?|volunteer|community|research|employment|qualifications?|addendum)$/i.test(t)) return false;
    return true;
  });

  if (bodyLines.length < 5) {
    return { severity: 'none', issues: [] };
  }

  // Measure alternation: count how often short/long pattern toggles
  const lengths = bodyLines.map((l) => l.length);
  const shortFlags = lengths.map((len) => len < shortLineThreshold);
  let alternations = 0;
  for (let i = 1; i < shortFlags.length; i++) {
    if (shortFlags[i] !== shortFlags[i - 1]) alternations++;
  }
  // High alternation means lines keep switching between short and long
  const maxPossibleAlternations = shortFlags.length - 1;
  const alternationRatio =
    maxPossibleAlternations > 0 ? alternations / maxPossibleAlternations : 0;

  // Also count runs of short lines (3+ short lines in a row is suspicious)
  let shortRuns = 0;
  let currentRun = 0;
  for (const isShort of shortFlags) {
    if (isShort) {
      currentRun++;
    } else {
      if (currentRun >= 3) shortRuns++;
      currentRun = 0;
    }
  }
  if (currentRun >= 3) shortRuns++;

  // Signal 3: Proportion of short body lines
  const shortBodyCount = bodyLines.filter((l) => l.trim().length < shortLineThreshold).length;
  const shortBodyRatio = shortBodyCount / bodyLines.length;

  // Signal 4: Very long lines (>250 chars — two columns concatenated into one line by ATS)
  const veryLongLines = contentLines.filter((l) => l.length > 250).length;

  // Determine severity
  let severity: 'high' | 'medium' | 'low' | 'none' = 'none';

  // High: heavy tab usage OR strong stagger + many short lines OR all lines are short (narrow columns)
  if (tabLineRatio > 0.15 || (tabCount > 8 && shortBodyRatio > 0.35)) {
    severity = 'high';
    issues.push(
      'Multi-column layout detected (heavy tab/table usage). ATS reads left-to-right across columns, garbling your content order. Use a single-column layout.',
    );
  } else if (
    (veryLongLines > 5 && shortBodyRatio > 0.3) ||
    (alternationRatio > 0.55 && shortBodyRatio > 0.4 && shortRuns >= 2) ||
    (shortBodyRatio > 0.85 && bodyLines.length > 15)
  ) {
    severity = 'high';
    issues.push(
      shortBodyRatio > 0.85
        ? 'Multi-column layout strongly suspected. Almost all content lines are very short — typical when a 2-column resume is parsed and each column produces narrow text lines that interleave and confuse ATS parsers.'
        : 'Multi-column layout likely present. Lines alternate between short and long content — a classic sign of column formatting that breaks ATS parsing.',
    );
  } else if (
    (tabCount > 3) ||
    (alternationRatio > 0.4 && shortBodyRatio > 0.35) ||
    shortRuns >= 3 ||
    (shortBodyRatio > 0.6 && shortRuns >= 2 && bodyLines.length > 10)
  ) {
    severity = 'medium';
    issues.push(
      'Possible multi-column layout. If your resume uses columns or tables, switch to a single-column format for better ATS compatibility.',
    );
  } else if (shortBodyRatio > 0.5 && bodyLines.length > 25) {
    severity = 'low';
    issues.push(
      'Many short content lines found — this can happen with column layouts. Verify all content reads sequentially in a single column.',
    );
  }

  return { severity, issues };
}

function scoreFormatCleanliness(text: string): CriterionResult {
  let score = 100;
  const issues: string[] = [];

  // --- Multi-column layout detection (highest impact) ---
  const multiColumn = detectMultiColumnLayout(text);
  if (multiColumn.severity === 'high') {
    score -= 40;
    issues.push(...multiColumn.issues.slice(0, 1));
  } else if (multiColumn.severity === 'medium') {
    score -= 20;
    issues.push(...multiColumn.issues.slice(0, 1));
  } else if (multiColumn.severity === 'low') {
    score -= 10;
    issues.push(...multiColumn.issues.slice(0, 1));
  }

  // Check for smart quotes and other non-ASCII punctuation
  const smartQuotes = (text.match(/[\u2018\u2019\u201C\u201D\u201E\u201F]/g) || []).length;
  if (smartQuotes > 0) {
    const penalty = Math.min(25, smartQuotes * 5);
    score -= penalty;
    issues.push(`${smartQuotes} smart/curly quotes detected — ATS may mis-parse them.`);
  }

  // Check for em-dashes, en-dashes
  const dashes = (text.match(/[\u2013\u2014]/g) || []).length;
  if (dashes > 0) {
    const penalty = Math.min(15, dashes * 3);
    score -= penalty;
    issues.push(`${dashes} em/en dashes detected — use standard hyphens instead.`);
  }

  // Check for non-ASCII bullets
  const unicodeBullets = (text.match(/[\u2022\u25CF\u25E6\u2043\u00B7]/g) || []).length;
  if (unicodeBullets > 0) {
    const penalty = Math.min(20, unicodeBullets * 4);
    score -= penalty;
    issues.push(`${unicodeBullets} unicode bullets detected — stick to "- " for best ATS parsing.`);
  }

  // Check for tab characters (can indicate tables) — already handled by multi-column above
  const tabs = (text.match(/\t/g) || []).length;
  if (tabs > 5 && multiColumn.severity === 'none') {
    // Only flag tabs separately if multi-column didn't already catch it
    score -= 20;
    issues.push(`${tabs} tab characters found — may indicate tables that confuse ATS parsers.`);
  }

  // Check for non-breaking spaces
  const nbSpaces = (text.match(/\u00A0/g) || []).length;
  if (nbSpaces > 0) {
    score -= 10;
  }

  // Check for zero-width characters
  const zwChars = (text.match(/[\u200B-\u200D\uFEFF]/g) || []).length;
  if (zwChars > 0) {
    score -= 10;
    issues.push('Invisible/zero-width characters detected — can cause ATS parsing issues.');
  }

  // Check for very long lines (>200 chars — potential column layout remnants)
  const longLines = text.split('\n').filter((l) => l.length > 200);
  if (longLines.length > 3 && multiColumn.severity === 'none') {
    // Only flag separately if multi-column didn't catch it
    score -= 15;
    issues.push(`${longLines.length} very long lines — may indicate column layout that confuses ATS.`);
  } else if (longLines.length > 0 && multiColumn.severity === 'none') {
    score -= 5;
  }

  // Ellipsis check
  const ellipsis = (text.match(/\u2026/g) || []).length;
  if (ellipsis > 0) {
    score -= 5;
  }

  score = Math.max(0, Math.min(100, score));

  return {
    score,
    weight: 5,
    feedback: score >= 90
      ? 'Clean plain-text formatting — strong ATS compatibility.'
      : tipFromIssues(issues, 'Replace fancy quotes/symbols with plain characters ATS can parse.'),
  };
}

function scoreDateConsistency(text: string): CriterionResult {
  const yearRanges = text.match(/\b(19|20)\d{2}\s*[-–to]+\s*((19|20)\d{2}|present|current)\b/gi) || [];
  const monthYearDates = text.match(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{4}\b/gi) || [];

  // Check if dates are consistently formatted
  const yearOnly = text.match(/\b(19|20)\d{2}\b/g) || [];

  let score = 50; // Start at 50
  const issues: string[] = [];
  const good: string[] = [];

  // Year ranges (proper date format): +25 if 2+
  if (yearRanges.length >= 2) {
    score += 25;
    good.push('Dates use proper year-range format (YYYY - YYYY).');
  } else if (yearRanges.length === 1) {
    score += 10;
  } else {
    // Look for any dates at all
    if (monthYearDates.length === 0) {
      score -= 20;
      issues.push('No month/year dates found. ATS looks for chronological experience.');
    }
  }

  // Month + Year format: +15 if present
  if (monthYearDates.length >= 2) {
    score += 15;
    good.push('Includes month-level date granularity.');
  } else if (monthYearDates.length === 1) {
    score += 5;
  }

  // Only years (no months): -15
  if (yearOnly.length > 0 && monthYearDates.length === 0) {
    score -= 15;
    issues.push('Only years found — adding months improves ATS parsing.');
  }

  // Consistent format check: all year ranges use same separator
  const dashRanges = yearRanges.filter((r) => /–/.test(r));
  const hyphenRanges = yearRanges.filter((r) => /-/.test(r));
  if (dashRanges.length > 0 && hyphenRanges.length > 0) {
    score -= 10;
    issues.push('Inconsistent date separators (mixing en-dashes and hyphens).');
  }

  // "Present" usage
  const hasPresent = /present|current/i.test(text);
  if (hasPresent) score += 5;

  score = Math.max(0, Math.min(100, score));

  return {
    score,
    weight: 5,
    feedback: score >= 80
      ? 'Dates use a consistent month/year format.'
      : tipFromIssues(issues, 'Use consistent dates like Jan 2021 – Present.', 1),
  };
}

/* ------------------------------------------------------------------ */
/*  File-level hints (called from the API with file metadata)          */
/* ------------------------------------------------------------------ */

function analyzeFileHints(
  filename: string,
  parsedText: string,
): FileHints {
  const lower = filename.toLowerCase();
  const isPdf = lower.endsWith('.pdf');
  const isDocx = lower.endsWith('.docx');
  const isTxt = lower.endsWith('.txt');
  const mightBeScanned = isPdf && parsedText.trim().length < 100;

  let formatQuality: FileHints['formatQuality'];
  let formatAdvice: string;

  if (isDocx) {
    formatQuality = 'best';
    formatAdvice = '.docx is the most ATS-compatible format — excellent choice.';
  } else if (isTxt) {
    formatQuality = 'good';
    formatAdvice = '.txt works but lacks formatting. Consider .docx for better ATS parsing.';
  } else if (isPdf && mightBeScanned) {
    formatQuality = 'poor';
    formatAdvice = 'This PDF appears to be a scanned/image PDF. ATS parsers (Workday, SuccessFactors, Bullhorn) struggle with scanned PDFs. Use a text-based PDF or .docx instead.';
  } else if (isPdf) {
    formatQuality = 'good';
    formatAdvice = 'Text-based PDF is good, but .docx is slightly more reliable for ATS parsing across all platforms.';
  } else {
    formatQuality = 'unknown';
    formatAdvice = 'Unknown file format. For best ATS compatibility, use .docx.';
  }

  return {
    extension: lower.split('.').pop() ?? 'unknown',
    isPdf,
    isDocx,
    isTxt,
    mightBeScanned,
    formatQuality,
    formatAdvice,
  };
}

/* ------------------------------------------------------------------ */
/*  Keyword extraction & JD comparison                                  */
/* ------------------------------------------------------------------ */

/** Tech/domain keywords to look for in resumes and JDs (longest phrases matched first). */
const TECH_KEYWORDS = [
  // Languages
  'javascript', 'typescript', 'python', 'java', 'c#', 'c++', 'ruby', 'golang', 'rust',
  'swift', 'kotlin', 'php', 'scala', 'perl', 'bash', 'shell', 'sql', 'graphql',
  // Frameworks & Libraries
  'react', 'angular', 'vue', 'svelte', 'next.js', 'nuxt', 'node.js', 'express',
  'django', 'flask', 'spring boot', 'spring', 'rails', 'laravel', 'asp.net',
  '.net', 'flutter', 'react native', 'tensorflow', 'pytorch', 'jquery',
  // Databases
  'postgresql', 'postgres', 'mysql', 'mongodb', 'redis', 'elasticsearch',
  'cassandra', 'dynamodb', 'sqlite', 'mariadb', 'oracle', 'sql server',
  'bigquery', 'firestore', 'supabase', 'prisma', 'drizzle',
  // Cloud & DevOps
  'google cloud', 'aws', 'azure', 'gcp', 'docker', 'kubernetes', 'k8s',
  'terraform', 'ansible', 'jenkins', 'circleci', 'github actions', 'gitlab ci',
  'ci/cd', 'helm', 'prometheus', 'grafana', 'datadog',
  // Tools & Platforms
  'linux', 'nginx', 'webpack', 'vite', 'babel', 'jest', 'vitest',
  'cypress', 'playwright', 'selenium', 'kafka', 'rabbitmq', 'grpc', 'git',
  // AI/ML
  'machine learning', 'deep learning', 'artificial intelligence', 'computer vision',
  'data science', 'langchain', 'openai', 'nlp', 'llm',
  // Methodologies
  'agile', 'scrum', 'kanban', 'waterfall', 'tdd', 'bdd',
  // Testing & Performance
  'load testing', 'performance testing', 'integration testing', 'unit testing',
  'e2e testing', 'jmeter', 'gatling', 'k6',
  // Short tokens — only matched with strict word boundaries (see keywordInText)
  'go', 'r',
];

/** Sorted longest-first so "spring boot" wins over "spring". */
const TECH_KEYWORDS_SORTED = [...TECH_KEYWORDS].sort((a, b) => b.length - a.length);

/** Treat JD/resume keyword pairs as equivalent for match scoring. */
const KEYWORD_EQUIVALENTS: Record<string, string[]> = {
  postgresql: ['postgres'],
  postgres: ['postgresql'],
  golang: ['go'],
  go: ['golang'],
  k8s: ['kubernetes'],
  kubernetes: ['k8s'],
  'node.js': ['nodejs', 'node'],
  'next.js': ['nextjs', 'next'],
  'react native': ['react-native', 'reactnative'],
};

const STOP_ACRONYMS = new Set([
  'the', 'and', 'for', 'are', 'you', 'all', 'can', 'has', 'had', 'but', 'not',
  'our', 'its', 'per', 'via', 'pdf', 'doc', 'cv', 'usa', 'ind', 'inc', 'llc',
]);

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * True when `keyword` appears as a whole token in `text` — not as a substring
 * inside another word (e.g. "go" in "ago", "r" in "performance").
 */
export function keywordInText(text: string, keyword: string): boolean {
  const trimmed = keyword.trim();
  if (!trimmed) return false;
  const parts = trimmed.split(/\s+/).map(escapeRegex);
  const core = parts.join('\\s+');
  const pattern = `(?<![a-z0-9#])${core}(?![a-z0-9#])`;
  return new RegExp(pattern, 'i').test(text);
}

function resumeHasKeyword(resumeKeywords: Set<string>, jdKeyword: string): boolean {
  const lower = jdKeyword.toLowerCase();
  if (resumeKeywords.has(lower)) return true;
  const aliases = KEYWORD_EQUIVALENTS[lower] ?? [];
  return aliases.some((alias) => resumeKeywords.has(alias.toLowerCase()));
}

function jdHasKeyword(jdKeywords: Set<string>, resumeKeyword: string): boolean {
  const lower = resumeKeyword.toLowerCase();
  if (jdKeywords.has(lower)) return true;
  const aliases = KEYWORD_EQUIVALENTS[lower] ?? [];
  return aliases.some((alias) => jdKeywords.has(alias.toLowerCase()));
}

/**
 * Extract concrete technical keywords from a text blob.
 */
export function extractKeywords(text: string): string[] {
  const found = new Set<string>();

  for (const kw of TECH_KEYWORDS_SORTED) {
    if (keywordInText(text, kw)) {
      found.add(kw);
    }
  }

  // Capitalized product/tool names: Datadog, Sentry, Tableau
  const lower = text.toLowerCase();
  const words = lower.split(/[\s,;()]+/);
  for (const w of words) {
    if (w.length >= 4 && w.length <= 20 && /^[a-z][a-z0-9]+$/.test(w)) {
      if (found.has(w)) continue;
      const regex = new RegExp(`\\b${escapeRegex(w)}\\b`, 'i');
      const originalMatch = text.match(regex);
      if (originalMatch && /^[A-Z]/.test(originalMatch[0])) {
        found.add(w);
      }
    }
  }

  const acronyms = text.match(/\b[A-Z]{2,5}\b/g) || [];
  for (const acro of acronyms) {
    const acroLower = acro.toLowerCase();
    if (!STOP_ACRONYMS.has(acroLower)) {
      found.add(acroLower);
    }
  }

  return [...found].sort();
}

/**
 * Compare resume keywords against a job description.
 */
export function compareWithJobDescription(
  resumeText: string,
  jobDescription: string,
): JdMatchResult {
  const resumeKeywords = new Set(extractKeywords(resumeText).map((k) => k.toLowerCase()));
  const jdKeywords = new Set(extractKeywords(jobDescription).map((k) => k.toLowerCase()));

  const matched: string[] = [];
  const missing: string[] = [];
  const extra: string[] = [];

  for (const kw of jdKeywords) {
    if (resumeHasKeyword(resumeKeywords, kw)) {
      matched.push(kw);
    } else {
      missing.push(kw);
    }
  }

  for (const kw of resumeKeywords) {
    if (!jdHasKeyword(jdKeywords, kw)) {
      extra.push(kw);
    }
  }

  const matchScore = jdKeywords.size > 0
    ? Math.round((matched.length / jdKeywords.size) * 100)
    : 0;

  return {
    matched: matched.sort(),
    missing: missing.sort(),
    extra: extra.sort(),
    matchScore: Math.min(100, matchScore),
  };
}

/* ------------------------------------------------------------------ */
/*  Main entry point                                                   */
/* ------------------------------------------------------------------ */

/**
 * Analyze a resume for ATS-friendliness.
 *
 * @param resumeText - The plain-text content of the resume.
 * @param filename   - Optional filename for file-level checks.
 * @param jobDescription - Optional job description for keyword gap analysis.
 * @returns AtsCheckResult with scores, feedback, and improvement suggestions.
 */
export function checkAtsCompatibility(
  resumeText: string,
  filename?: string,
  jobDescription?: string,
): AtsCheckResult {
  const normalized = resumeText.trim().replace(/\r\n/g, '\n');

  // Reflow flattened text (lost line structure) so layout detectors get a fair
  // shot, then judge how trustworthy the resulting structure is.
  const { text, wasReflowed } = reflowFlattenedText(normalized);
  const parseQuality = assessParseQuality(text);
  const textLines = text.split(String.fromCharCode(10));

  // Run all criteria
  const sectionStructure = scoreSectionStructure(text);
  const contactInfo = scoreContactInfo(text);
  const bulletQuality = scoreBulletQuality(text);
  const quantifiableAchievements = scoreQuantifiableAchievements(text);
  const skillsOptimization = scoreSkillsOptimization(text);
  const lengthReadability = scoreLengthReadability(text);
  const formatCleanliness = scoreFormatCleanliness(text);
  const dateConsistency = scoreDateConsistency(text);

  // Weighted overall score
  const allCriteria = [
    sectionStructure,
    contactInfo,
    bulletQuality,
    quantifiableAchievements,
    skillsOptimization,
    lengthReadability,
    formatCleanliness,
    dateConsistency,
  ];

  // Adaptive weighting: when the extractor mangled the layout we cannot trust
  // the layout-dependent criteria (structure, bullets, format). Halve their
  // influence so a parsing failure doesn't masquerade as a bad resume. The
  // remaining criteria (contact, skills, achievements, length, dates) carry
  // the score, and the renormalization below keeps it on a 0-100 scale.
  const LAYOUT_DEPENDENT = new Set([
    sectionStructure,
    bulletQuality,
    formatCleanliness,
  ]);
  const effectiveWeight = (c: CriterionResult): number =>
    parseQuality === 'degraded' && LAYOUT_DEPENDENT.has(c) ? c.weight * 0.5 : c.weight;

  const totalWeight = allCriteria.reduce((sum, c) => sum + effectiveWeight(c), 0);
  const overallScore = Math.round(
    allCriteria.reduce((sum, c) => sum + c.score * (effectiveWeight(c) / totalWeight), 0),
  );

  // File hints (needed before issue collection for format recommendations)
  const fileHints = filename ? analyzeFileHints(filename, text) : undefined;

  // Collect issues and good practices
  const allIssues: string[] = [];
  const allGood: string[] = [];

  // Extract from feedback — only treat truly strong scores as "doing well"
  // (score 70–89 often still has caveats like "Minor formatting issues").
  for (const criterion of allCriteria) {
    if (criterion.score < 50) {
      allIssues.push(criterion.feedback);
    } else if (criterion.score >= 90) {
      allGood.push(criterion.feedback);
    }
  }

  // Also extract specific detected issues from the individual functions' inline comments
  if (contactInfo.score < 80) {
    const textLower = text.toLowerCase();
    if (!textLower.includes('@')) allIssues.push('Email address not detected.');
    if (!/linkedin/i.test(text)) allIssues.push('LinkedIn profile URL not found.');
  }

  if (skillsOptimization.score < 50) {
    allIssues.push('Add a dedicated Skills section with concrete technical keywords.');
  }

  if (quantifiableAchievements.score < 50) {
    allIssues.push('Add numbers, percentages, and metrics to experience bullets.');
  }

  // File format recommendation (only for poor formats)
  if (fileHints && fileHints.formatQuality === 'poor') {
    allIssues.push(fileHints.formatAdvice ?? '');
  }

  // Top improvements (prioritize lowest-scoring criteria with proper key mapping)
  const CRITERION_KEYS: (keyof AtsCheckResult['breakdown'])[] = [
    'sectionStructure',
    'contactInfo',
    'bulletQuality',
    'quantifiableAchievements',
    'skillsOptimization',
    'lengthReadability',
    'formatCleanliness',
    'dateConsistency',
  ];

  const CRITERION_LABELS: Record<keyof AtsCheckResult['breakdown'], string> = {
    sectionStructure: 'Sections',
    contactInfo: 'Contact',
    bulletQuality: 'Bullets',
    quantifiableAchievements: 'Impact',
    skillsOptimization: 'Skills',
    lengthReadability: 'Length',
    formatCleanliness: 'Format',
    dateConsistency: 'Dates',
  };

  const scoredCriteria: { key: keyof AtsCheckResult['breakdown']; result: CriterionResult }[] =
    CRITERION_KEYS.map((key, i) => ({ key, result: allCriteria[i] }));

  const sortedByScore = [...scoredCriteria].sort((a, b) => a.result.score - b.result.score);
  const topImprovements = sortedByScore.slice(0, 3).map(({ key, result }) =>
    `${CRITERION_LABELS[key]} — ${humanActionTip(key, result.feedback)}`,
  );

  // JD keyword comparison
  const jdMatch = jobDescription
    ? compareWithJobDescription(text, jobDescription)
    : undefined;

  // Resume stats
  const sectionHeaders = findSectionHeaders(textLines);
  const stats: ResumeStats = {
    wordCount: text.split(/\s+/).filter(Boolean).length,
    charCount: text.length,
    bulletCount: findBulletLines(textLines).length,
    sectionCount: sectionHeaders.length,
  };

  let parseWarning: string | undefined;
  if (parseQuality === 'unreadable') {
    parseWarning =
      'Very little readable text was extracted. This is usually a scanned/image PDF — export a text-based PDF or .docx and re-check.';
  } else if (parseQuality === 'degraded') {
    parseWarning = wasReflowed
      ? 'Your resume\'s line structure was hard to read (often from a multi-column or image-heavy layout). We reconstructed it as best we could; structure/bullet/format scores are approximate. For an accurate read, upload a single-column .docx.'
      : 'Section structure could not be clearly detected. Structure, bullet, and formatting scores are approximate — a single-column .docx gives the most accurate result.';
  }

  return {
    overallScore,
    breakdown: {
      sectionStructure,
      contactInfo,
      bulletQuality,
      quantifiableAchievements,
      skillsOptimization,
      lengthReadability,
      formatCleanliness,
      dateConsistency,
    },
    stats,
    parseQuality,
    parseWarning,
    topImprovements: [...new Set(topImprovements)].slice(0, 5),
    detectedIssues: [...new Set(allIssues)].slice(0, 8),
    goodPractices: [...new Set(allGood)].slice(0, 5),
    fileHints,
    jdMatch,
  };
}
