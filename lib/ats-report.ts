/**
 * Enhancv-style ATS report model — maps zero-LLM AtsCheckResult into
 * category rails + issue cards (with resume quotes). Pure helpers.
 */

import type { AtsCheckResult } from './ats-checker';
import { ATS_CRITERION_LABELS, type AtsCriterionKey } from './ats-fix';

export type AtsReportTier = 'free' | 'premium';

export type AtsReportCategoryId =
  | 'content'
  | 'sections'
  | 'ats_essentials'
  | 'hr'
  | 'discrimination'
  | 'seniority'
  | 'tailoring';

export type AtsReportCheckStatus = 'pass' | 'fail' | 'warn' | 'locked';

export interface AtsReportQuote {
  text: string;
}

/** Item extracted from the user's resume, e.g. "Email address: a@b.com" */
export interface AtsReportFoundItem {
  label: string;
  value?: string;
  ok: boolean;
}

/** A repeated word with replacement ideas (Enhancv-style). */
export interface AtsReportRepetition {
  word: string;
  count: number;
  suggestions: string[];
}

export interface AtsReportCheck {
  id: string;
  /** Maps to Fix Studio weakness when present */
  weaknessId?: string;
  criterionKey?: AtsCriterionKey | 'jdKeywords' | 'parse' | 'premium';
  label: string;
  status: AtsReportCheckStatus;
  /** 0–100 live score for gradient coloring (red→amber→green). Optional. */
  score?: number;
  /** Short status line (“3 issues”, “No issues”, “Locked”) */
  summary: string;
  /** Longer explanation for the expanded card */
  detail: string;
  /** One-liner: why this check matters for ATS/recruiters */
  education?: string;
  /** Success copy with the user's real data when the check passes */
  passText?: string;
  quotes?: AtsReportQuote[];
  /** Extracted per-user items (contact fields, sections found) */
  foundItems?: AtsReportFoundItem[];
  /** Repeated words with replacement pills */
  repetitions?: AtsReportRepetition[];
  /** Optional “did you mean” pairs for spelling-like issues */
  suggestions?: Array<{ found: string; suggestion: string }>;
  /**
   * When fail/warn has no resume quotes/foundItems:
   * - string → show this tip instead of “Not found in your resume”
   * - null → hide the red empty chip (detail is enough)
   * - undefined → default “Not found…” for true absences
   */
  emptyHint?: string | null;
}

export interface AtsReportCategory {
  id: AtsReportCategoryId;
  label: string;
  tier: AtsReportTier;
  /** 0–100, or null when locked / unknown */
  score: number | null;
  locked: boolean;
  issueCount: number;
  checks: AtsReportCheck[];
}

export interface AtsReport {
  overallScore: number;
  issueCount: number;
  parseRatePercent: number;
  categories: AtsReportCategory[];
}

const NEEDS_WORK_BELOW = 75;

function bulletLines(text: string): string[] {
  const bulletChars = '-•*→⁃▪▸▹►‣∙○●';
  const bulletRegex = new RegExp(`^[${bulletChars}]`);
  return text.split('\n').filter((l) => {
    const t = l.trim();
    if (!t) return false;
    if (bulletRegex.test(t)) return true;
    if (/^\d+[.)]\s/.test(t)) return true;
    return false;
  });
}

function stripBullet(line: string): string {
  return line.trim().replace(/^[-•*→\d.)]+\s*/, '').trim();
}

/** Bullets that look like duties without measurable impact. */
export function findUnquantifiedBullets(resumeText: string, limit = 3): string[] {
  const dateOnly = /\b(19|20)\d{2}\b/;
  const out: string[] = [];
  for (const raw of bulletLines(resumeText)) {
    const body = stripBullet(raw);
    if (body.length < 24) continue;
    const hasNumber = /\d/.test(body);
    const isOnlyDate =
      dateOnly.test(body) && !/[%$%,.\d]{2,}/.test(body.replace(dateOnly, ''));
    if (!hasNumber || isOnlyDate) {
      out.push(body);
      if (out.length >= limit) break;
    }
  }
  return out;
}

/** Short / thin bullets. */
export function findThinBullets(resumeText: string, limit = 3): string[] {
  const out: string[] = [];
  for (const raw of bulletLines(resumeText)) {
    const body = stripBullet(raw);
    const words = body.split(/\s+/).filter(Boolean);
    if (words.length > 0 && words.length < 4) {
      out.push(body);
      if (out.length >= limit) break;
    }
  }
  return out;
}

/**
 * Experience/duty lines that are not proper "- " bullets — common when
 * PDF extraction flattens bullets into plain paragraphs.
 */
export function findProseDutyLines(resumeText: string, limit = 3): string[] {
  const lines = resumeText.split('\n');
  const expIdx = lines.findIndex((l) =>
    /^(professional\s+)?(work\s+)?experience$|^employment$|^work\s+history$/i.test(l.trim()),
  );
  const start = expIdx >= 0 ? expIdx + 1 : 0;
  const bulletChars = '-•*→⁃▪▸▹►‣∙○●';
  const bulletRe = new RegExp(`^[${bulletChars}]`);
  const out: string[] = [];
  for (let i = start; i < lines.length; i++) {
    const t = lines[i].trim();
    if (!t || t.length < 40) continue;
    if (/^[A-Z][A-Z\s&/.-]{4,}$/.test(t)) break; // next ALL-CAPS section
    if (/^(education|skills|projects|certifications)\b/i.test(t)) break;
    if (bulletRe.test(t) || /^\d+[.)]\s/.test(t)) continue;
    // Prefer duty-like lines (verbs / tools), skip contact-like
    if (/@|linkedin\.com|^\+?\d[\d\s().-]{7,}/i.test(t)) continue;
    out.push(t.length > 140 ? `${t.slice(0, 137)}…` : t);
    if (out.length >= limit) break;
  }
  return out;
}

/** Lines with years but no month — weak for ATS date parsing. */
export function findWeakDateLines(resumeText: string, limit = 3): string[] {
  const monthRe = /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\b/i;
  const yearRe = /\b(19|20)\d{2}\b/;
  const out: string[] = [];
  for (const raw of resumeText.split('\n')) {
    const t = raw.trim();
    if (!t || !yearRe.test(t)) continue;
    if (monthRe.test(t)) continue;
    out.push(t.length > 120 ? `${t.slice(0, 117)}…` : t);
    if (out.length >= limit) break;
  }
  return out;
}

/** Lines with curly quotes / fancy dashes ATS may misread. */
export function findFormatIssueLines(resumeText: string, limit = 3): string[] {
  const fancy = /[\u2018\u2019\u201C\u201D\u2013\u2014]/;
  const out: string[] = [];
  for (const raw of resumeText.split('\n')) {
    const t = raw.trim();
    if (!t || !fancy.test(t)) continue;
    out.push(t.length > 120 ? `${t.slice(0, 117)}…` : t);
    if (out.length >= limit) break;
  }
  return out;
}

/** First lines that look like contact / header — used when contact is weak. */
export function findTopContactLines(resumeText: string, limit = 4): string[] {
  return resumeText
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, limit);
}

/** Overused verbs/phrases + replacement ideas (repetition check). */
const REPETITION_SYNONYMS: Record<string, string[]> = {
  managed: ['directed', 'oversaw', 'coordinated'],
  developed: ['built', 'engineered', 'created'],
  created: ['designed', 'established', 'produced'],
  worked: ['collaborated', 'partnered', 'contributed'],
  responsible: ['owned', 'led', 'drove'],
  led: ['headed', 'directed', 'spearheaded'],
  handled: ['resolved', 'processed', 'administered'],
  used: ['applied', 'leveraged', 'utilized'],
  implemented: ['deployed', 'rolled out', 'executed'],
  conducted: ['performed', 'carried out', 'ran'],
  assisted: ['supported', 'facilitated', 'enabled'],
  helped: ['enabled', 'supported', 'guided'],
  ensured: ['guaranteed', 'verified', 'maintained'],
  improved: ['optimized', 'enhanced', 'strengthened'],
  provided: ['delivered', 'supplied', 'offered'],
  performed: ['executed', 'completed', 'carried out'],
  involved: ['engaged', 'participated', 'contributed'],
  supported: ['backed', 'facilitated', 'reinforced'],
  maintained: ['sustained', 'upheld', 'preserved'],
  designed: ['architected', 'crafted', 'devised'],
  built: ['constructed', 'developed', 'assembled'],
  tested: ['validated', 'verified', 'evaluated'],
  various: ['specific', 'targeted', '(name them)'],
};

/**
 * Words repeated too often (>= 3 uses) across the resume — recruiters and
 * ATS keyword extractors both notice monotone verb use.
 */
export function findRepeatedWords(resumeText: string, minCount = 3): AtsReportRepetition[] {
  const counts = new Map<string, number>();
  for (const m of resumeText.toLowerCase().matchAll(/\b[a-z]{4,}\b/g)) {
    const w = m[0];
    if (!(w in REPETITION_SYNONYMS)) continue;
    counts.set(w, (counts.get(w) ?? 0) + 1);
  }
  return [...counts.entries()]
    .filter(([, n]) => n >= minCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([word, count]) => ({ word, count, suggestions: REPETITION_SYNONYMS[word] ?? [] }));
}

/** Common resume misspellings (zero-LLM dictionary). */
const MISSPELLINGS: Record<string, string> = {
  knowledege: 'knowledge',
  knowlege: 'knowledge',
  recieve: 'receive',
  recieved: 'received',
  seperate: 'separate',
  managment: 'management',
  mangement: 'management',
  enviroment: 'environment',
  enviornment: 'environment',
  occured: 'occurred',
  acheive: 'achieve',
  acheived: 'achieved',
  achivement: 'achievement',
  achievment: 'achievement',
  sucessful: 'successful',
  succesful: 'successful',
  sucess: 'success',
  succesfully: 'successfully',
  sucessfully: 'successfully',
  responsibilty: 'responsibility',
  responsiblities: 'responsibilities',
  experiance: 'experience',
  experence: 'experience',
  profesional: 'professional',
  proffessional: 'professional',
  developement: 'development',
  devlopment: 'development',
  maintainance: 'maintenance',
  maintenence: 'maintenance',
  buisness: 'business',
  bussiness: 'business',
  calender: 'calendar',
  comittee: 'committee',
  commitee: 'committee',
  definately: 'definitely',
  existance: 'existence',
  independant: 'independent',
  liason: 'liaison',
  neccessary: 'necessary',
  necessery: 'necessary',
  occassion: 'occasion',
  perseverence: 'perseverance',
  priviledge: 'privilege',
  recomend: 'recommend',
  recomended: 'recommended',
  refered: 'referred',
  relevent: 'relevant',
  untill: 'until',
  wich: 'which',
  teh: 'the',
  adress: 'address',
  begining: 'beginning',
  beleive: 'believe',
  collegue: 'colleague',
  colleages: 'colleagues',
  comunication: 'communication',
  commuication: 'communication',
  concious: 'conscious',
  curiculum: 'curriculum',
  curriculam: 'curriculum',
  definite: 'definite',
  efficent: 'efficient',
  eficient: 'efficient',
  finacial: 'financial',
  goverment: 'government',
  garantee: 'guarantee',
  immediatly: 'immediately',
  infrastucture: 'infrastructure',
  intergration: 'integration',
  langauge: 'language',
  lenght: 'length',
  libary: 'library',
  paralell: 'parallel',
  posession: 'possession',
  prefered: 'preferred',
  proccess: 'process',
  proceses: 'processes',
  publically: 'publicly',
  reccomend: 'recommend',
  reserach: 'research',
  scheduel: 'schedule',
  strenght: 'strength',
  strenghts: 'strengths',
  supercede: 'supersede',
  tecnology: 'technology',
  technlogy: 'technology',
  tommorow: 'tomorrow',
  transfered: 'transferred',
  writting: 'writing',
  accomodate: 'accommodate',
  aquire: 'acquire',
  aquired: 'acquired',
  analysed: 'analyzed',
  apparant: 'apparent',
  archtecture: 'architecture',
  athough: 'although',
  benifit: 'benefit',
  benifits: 'benefits',
};

/** Misspelled words with context line + correction. Case-preserving match. */
export function findSpellingIssues(
  resumeText: string,
  limit = 6,
): Array<{ found: string; suggestion: string; context: string }> {
  const out: Array<{ found: string; suggestion: string; context: string }> = [];
  const seen = new Set<string>();
  for (const raw of resumeText.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    for (const m of line.matchAll(/\b[A-Za-z]{3,}\b/g)) {
      const lower = m[0].toLowerCase();
      const fix = MISSPELLINGS[lower];
      if (!fix || fix === lower || seen.has(lower)) continue;
      seen.add(lower);
      out.push({
        found: m[0],
        suggestion: fix,
        context: line.length > 110 ? `${line.slice(0, 107)}…` : line,
      });
      if (out.length >= limit) return out;
    }
  }
  return out;
}

/** Extract contact fields from the resume header (top ~15 lines + whole text for links). */
export function extractContactInfo(resumeText: string): AtsReportFoundItem[] {
  const email = resumeText.match(/[\w.+-]+@[\w-]+\.[\w.]+/)?.[0];
  const phone = resumeText.match(
    /(\+?\d{1,3}[\s.-]?)?(\(?\d{3,5}\)?[\s.-]?)?\d{3,5}[\s.-]?\d{4,6}\b/,
  )?.[0]?.trim();
  const linkedin = resumeText.match(/linkedin\.com\/[A-Za-z0-9/_-]+/i)?.[0];
  const github = resumeText.match(/github\.com\/[A-Za-z0-9/_-]+/i)?.[0];
  const topLines = resumeText
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 12)
    .join(' ');
  // Loose location heuristic: "City, ST" / "City, Country" in the header
  const location = topLines.match(
    /\b([A-Z][a-z]{2,}(?:\s[A-Z][a-z]+)?),\s*([A-Z][a-zA-Z]{1,}(?:\s[A-Z][a-z]+)*)\b/,
  )?.[0];

  const items: AtsReportFoundItem[] = [
    { label: 'Email address', value: email, ok: Boolean(email) },
    { label: 'Phone number', value: phone && phone.replace(/\D/g, '').length >= 8 ? phone : undefined, ok: Boolean(phone && phone.replace(/\D/g, '').length >= 8) },
    { label: 'LinkedIn profile', value: linkedin, ok: Boolean(linkedin) },
    { label: 'Location', value: location, ok: Boolean(location) },
  ];
  if (github) items.push({ label: 'GitHub profile', value: github, ok: true });
  return items;
}

const ESSENTIAL_SECTIONS: Array<{ label: string; re: RegExp; required: boolean }> = [
  {
    label: 'Experience',
    // Heading may include employer name ("Accenture Experience")
    re: /\b(experiences?|employment|work\s+history)\b/im,
    required: true,
  },
  {
    label: 'Education',
    re: /\b(educations?|educational|academic)\b/im,
    required: true,
  },
  {
    label: 'Skills',
    re: /\b(skills?|expertise|competencies|technologies)\b/im,
    required: true,
  },
  {
    label: 'Summary',
    re: /\b(summary|profile|objective)\b/im,
    required: false,
  },
  { label: 'Projects', re: /\bprojects?\b/im, required: false },
  { label: 'Certifications', re: /\b(certifications?|licenses?)\b/im, required: false },
];

/**
 * Which essential resume sections were detected as headings.
 * Required sections always appear (pass/fail); optional ones only when found.
 */
export function findEssentialSections(resumeText: string): AtsReportFoundItem[] {
  const lines = resumeText
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => {
      if (l.length < 3 || l.length > 72) return false;
      if (/[.!?]$/.test(l)) return false;
      if (/@|https?:\/\//i.test(l)) return false;
      if (/^[\d•\-*]/.test(l)) return false;
      const words = l.split(/\s+/).filter(Boolean);
      if (words.length === 0 || words.length > 10) return false;
      if (words.length >= 6 && /^(the|a|an|i|my|with|over|demonstrated)\b/i.test(l)) {
        return false;
      }
      return true;
    });
  const out: AtsReportFoundItem[] = [];
  for (const { label, re, required } of ESSENTIAL_SECTIONS) {
    const found = lines.some((l) => re.test(l));
    if (required || found || label === 'Summary') {
      out.push({ label, ok: found });
    }
  }
  return out;
}

function parseRatePercent(result: AtsCheckResult): number {
  if (result.parseQuality === 'good') return 90 + Math.min(9, Math.floor(result.overallScore / 12));
  if (result.parseQuality === 'degraded') return 55 + Math.floor(result.overallScore / 5);
  return 25;
}

function criterionStatus(score: number): AtsReportCheckStatus {
  if (score >= NEEDS_WORK_BELOW) return 'pass';
  if (score >= 50) return 'warn';
  return 'fail';
}

function statusSummary(status: AtsReportCheckStatus, issueCount = 0): string {
  if (status === 'locked') return 'Locked';
  if (status === 'pass') return 'No issues';
  if (issueCount <= 0) return status === 'warn' ? '1 issue' : 'Needs work';
  return `${issueCount} issue${issueCount === 1 ? '' : 's'}`;
}

function avg(scores: number[]): number {
  if (scores.length === 0) return 0;
  return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
}

function lockedCheck(id: string, label: string): AtsReportCheck {
  return {
    id,
    criterionKey: 'premium',
    label,
    status: 'locked',
    summary: 'Locked',
    detail: 'Unlock with Hyred Premium for the full report.',
  };
}

function buildPremiumHeuristics(
  resumeText: string,
  result: AtsCheckResult,
): Pick<
  Record<AtsReportCategoryId, AtsReportCheck[]>,
  'hr' | 'discrimination' | 'seniority' | 'tailoring'
> {
  const lower = resumeText.toLowerCase();
  const vaguePhrases = [
    'responsible for',
    'various',
    'helped with',
    'worked on',
    'participated in',
    'assisted',
    'involved in',
  ];
  const vague = vaguePhrases.filter((p) => lower.includes(p));
  const involvedCount = (lower.match(/\binvolved\b/g) ?? []).length;

  const yearMatches = [...resumeText.matchAll(/\b((19|20)\d{2})\b/g)].map((m) => Number(m[1]));
  const oldest = yearMatches.length ? Math.min(...yearMatches) : null;
  const ageismRisk = oldest != null && oldest < 2010;

  const leadership = (
    resumeText.match(
      /\b(led|leads?|leading|managed|mentored|owned|directed|supervised|head of|trained|training)\b/gi,
    ) ?? []
  ).length;

  const softHits = (
    resumeText.match(
      /\b(communication|communicate[ds]?|collaboration|collaborat(?:ed|ion|ing)|teamwork|leadership|problem[- ]solving|stakeholder|coordinat(?:ed|ion|ing)|scrum)\b/gi,
    ) ?? []
  ).length;

  const actionHits = (
    resumeText.match(
      /\b(achieved|improved|reduced|delivered|built|designed|launched|optimized|automated)\b/gi,
    ) ?? []
  ).length;

  const credibilityFail = vague.length >= 3 || involvedCount >= 8;
  const credibilityWarn = !credibilityFail && (vague.length > 0 || involvedCount >= 3);
  const credibilityStatus: AtsReportCheckStatus = credibilityFail
    ? 'fail'
    : credibilityWarn
      ? 'warn'
      : 'pass';
  const credibilityIssues = Math.max(
    vague.length,
    involvedCount >= 3 ? 1 : 0,
  );

  const hr: AtsReportCheck[] = [
    {
      id: 'hr-credibility',
      criterionKey: 'premium',
      label: 'Credibility',
      status: credibilityStatus,
      summary: statusSummary(credibilityStatus, credibilityIssues),
      detail: credibilityFail
        ? involvedCount >= 8
          ? `“Involved” appears about ${involvedCount} times — duty filler without outcomes weakens credibility.`
          : 'Some lines sound vague. Swap filler phrases for concrete outcomes.'
        : credibilityWarn
          ? 'Some lines sound vague. Swap filler phrases for concrete outcomes.'
          : 'Language looks specific enough for a first HR screen.',
      quotes:
        involvedCount >= 3
          ? [{ text: 'Involved in' }]
          : vague.slice(0, 2).map((v) => ({ text: `…${v}…` })),
    },
    {
      id: 'hr-interview',
      criterionKey: 'premium',
      label: 'Interview Risks',
      status: result.breakdown.quantifiableAchievements.score < 50 ? 'warn' : 'pass',
      summary:
        result.breakdown.quantifiableAchievements.score < 50 ? '1 issue' : 'No issues',
      detail:
        result.breakdown.quantifiableAchievements.score < 50
          ? 'Weak metrics can trigger follow-up questions about impact. Add numbers recruiters can probe in interviews.'
          : 'Impact language looks interview-ready.',
      education: 'Interviewers dig into quantified claims. Thin metrics invite hard follow-ups.',
      emptyHint: null,
    },
  ];

  const discrimination: AtsReportCheck[] = [
    {
      id: 'disc-age',
      criterionKey: 'premium',
      label: 'Ageism & Date Bias',
      status: ageismRisk ? 'warn' : 'pass',
      summary: ageismRisk ? '1 issue' : 'No issues',
      detail: ageismRisk
        ? `Early dates (from ${oldest}) can invite age bias. Prefer recent roles and drop ancient graduation years when possible.`
        : 'No strong age-signal dates stood out.',
    },
    {
      id: 'disc-gaps',
      criterionKey: 'premium',
      label: 'Employment Gaps',
      status: 'pass',
      summary: 'No issues',
      detail: 'No obvious multi-year gaps detected from date tokens alone.',
    },
  ];

  const seniority: AtsReportCheck[] = [
    {
      id: 'sen-leadership',
      criterionKey: 'premium',
      label: 'Leadership Signals',
      status: leadership >= 2 ? 'pass' : leadership === 1 ? 'warn' : 'fail',
      summary: leadership >= 2 ? 'No issues' : leadership === 1 ? '1 issue' : 'Needs work',
      detail:
        leadership >= 2
          ? 'Leadership verbs show up in your experience.'
          : 'Add ownership verbs (lead, led, mentored, owned, trained) if you have that experience.',
      emptyHint: 'No ownership verbs like lead / led / mentored / owned showed up yet.',
    },
    {
      id: 'sen-skill-evidence',
      criterionKey: 'premium',
      label: 'Skill Evidence',
      status: criterionStatus(result.breakdown.skillsOptimization.score),
      summary: statusSummary(criterionStatus(result.breakdown.skillsOptimization.score)),
      detail: result.breakdown.skillsOptimization.feedback,
      weaknessId: 'skillsOptimization',
      emptyHint: null,
    },
  ];

  const jd = result.jdMatch;
  const tailoring: AtsReportCheck[] = [
    {
      id: 'tailor-hard',
      criterionKey: 'jdKeywords',
      label: 'Hard Skills',
      status: !jd
        ? 'warn'
        : jd.matchScore >= 70
          ? 'pass'
          : jd.matchScore >= 45
            ? 'warn'
            : 'fail',
      summary: !jd
        ? 'Add a job description'
        : jd.missing.length
          ? `${Math.min(jd.missing.length, 5)} gaps`
          : 'No issues',
      detail: !jd
        ? 'Paste a job description to unlock keyword gap analysis.'
        : jd.missing.length
          ? `Missing from the JD: ${jd.missing.slice(0, 6).join(', ')}.`
          : `Strong hard-skill overlap (${jd.matchScore}% match).`,
      weaknessId: jd?.missing?.[0] ? `jd:${jd.missing[0].toLowerCase()}` : undefined,
      emptyHint: !jd ? 'Add a job description to unlock this check.' : null,
    },
    {
      id: 'tailor-soft',
      criterionKey: 'premium',
      label: 'Soft Skills',
      status: softHits >= 3 ? 'pass' : softHits >= 1 ? 'warn' : 'fail',
      summary: softHits >= 3 ? 'No issues' : softHits >= 1 ? '1 issue' : 'Needs work',
      detail:
        softHits >= 3
          ? 'Soft skills appear in context.'
          : 'Weave collaboration / communication / leadership into bullets — not only a skills list.',
      emptyHint: 'Try naming soft skills in context (e.g. collaborated with…), not only in a list.',
    },
    {
      id: 'tailor-verbs',
      criterionKey: 'premium',
      label: 'Action Verbs',
      status: actionHits >= 5 ? 'pass' : actionHits >= 2 ? 'warn' : 'fail',
      summary: actionHits >= 5 ? 'No issues' : `${Math.max(1, 5 - actionHits)} to strengthen`,
      detail:
        actionHits >= 5
          ? 'Strong action-verb coverage.'
          : 'Start more bullets with concrete verbs (built, improved, delivered).',
      emptyHint: 'Swap duty fillers for verbs like built, improved, delivered.',
    },
    {
      id: 'tailor-title',
      criterionKey: 'premium',
      label: 'Tailored Title',
      status: 'warn',
      summary: 'Review',
      detail:
        'Align your headline / summary title with the target role wording when you apply.',
      emptyHint: 'Add a target JD, then mirror its title language in your headline.',
    },
  ];

  return { hr, discrimination, seniority, tailoring };
}

export function buildAtsReport(
  result: AtsCheckResult,
  resumeText: string,
  opts: { isPremium?: boolean } = {},
): AtsReport {
  const isPremium = Boolean(opts.isPremium);
  const b = result.breakdown;
  const unquantified = findUnquantifiedBullets(resumeText);
  const thin = findThinBullets(resumeText);
  const proseDuties = thin.length === 0 ? findProseDutyLines(resumeText) : [];
  const bulletEvidence = thin.length > 0 ? thin : proseDuties;
  const impactEvidence =
    unquantified.length > 0 ? unquantified : proseDuties.length > 0 ? proseDuties : bulletEvidence;
  const weakDates = findWeakDateLines(resumeText);
  const formatLines = findFormatIssueLines(resumeText);
  const topLines = findTopContactLines(resumeText);
  const parsePct = parseRatePercent(result);
  const repetitions = findRepeatedWords(resumeText);
  const spelling = findSpellingIssues(resumeText);
  const contactItems = extractContactInfo(resumeText);
  const sectionItems = findEssentialSections(resumeText);

  const repetitionStatus: AtsReportCheckStatus =
    repetitions.length >= 3 ? 'fail' : repetitions.length > 0 ? 'warn' : 'pass';
  const repetitionScore = Math.max(30, 100 - repetitions.length * 18);
  const worstRep = repetitions[0];

  const spellingStatus: AtsReportCheckStatus =
    spelling.length >= 3 ? 'fail' : spelling.length > 0 ? 'warn' : 'pass';
  const spellingScore = Math.max(25, 100 - spelling.length * 20);

  const wordCount = resumeText.split(/\s+/).filter(Boolean).length;

  const contentChecks: AtsReportCheck[] = [
    {
      id: 'content-parse',
      criterionKey: 'parse',
      label: 'ATS Parse Rate',
      score: parsePct,
      status: result.parseQuality === 'good' ? 'pass' : result.parseQuality === 'degraded' ? 'warn' : 'fail',
      summary: statusSummary(
        result.parseQuality === 'good' ? 'pass' : result.parseQuality === 'degraded' ? 'warn' : 'fail',
      ),
      education:
        'An ATS reads your resume as plain text before a human sees it. If it can’t parse your file cleanly, your skills never reach the recruiter.',
      detail:
        result.parseWarning ??
        `We read about ${parsePct}% of your resume clearly — a high parse rate helps ATS systems surface your skills.`,
      passText: `We parsed ${parsePct}% of your resume cleanly (${wordCount} words extracted). ATS systems will read this file without problems.`,
    },
    {
      id: 'content-quantify',
      weaknessId: 'quantifiableAchievements',
      criterionKey: 'quantifiableAchievements',
      label: 'Quantifying Impact',
      score: b.quantifiableAchievements.score,
      status: criterionStatus(b.quantifiableAchievements.score),
      summary: statusSummary(
        criterionStatus(b.quantifiableAchievements.score),
        unquantified.length,
      ),
      education:
        'Recruiters trust numbers. “Cut costs 18%” beats “reduced costs” — bullets without a metric read like duties, not achievements.',
      detail: b.quantifiableAchievements.feedback,
      passText: 'Your bullets carry real numbers — recruiters can see the size of your impact.',
      quotes: impactEvidence.map((t) => ({ text: t })),
    },
    {
      id: 'content-repetition',
      criterionKey: 'bulletQuality',
      label: 'Repetition',
      score: repetitionScore,
      status: repetitionStatus,
      summary: statusSummary(repetitionStatus, repetitions.length),
      education:
        'Using the same verb again and again makes every role sound identical. Varied verbs signal range — and give ATS keyword extractors more to match.',
      detail: worstRep
        ? `You use “${worstRep.word}” ${worstRep.count} times${repetitions.length > 1 ? ` (and ${repetitions.length - 1} more overused word${repetitions.length > 2 ? 's' : ''})` : ''}. Swap some for stronger synonyms.`
        : 'No overused words detected — your verb variety looks healthy.',
      passText: 'No overused words detected — your verb variety looks healthy.',
      repetitions,
    },
    {
      id: 'content-spelling',
      criterionKey: 'bulletQuality',
      label: 'Spelling & Grammar',
      score: spellingScore,
      status: spellingStatus,
      summary: statusSummary(spellingStatus, spelling.length),
      education:
        'A single typo can cost an interview — 77% of hiring managers reject resumes with spelling mistakes, and ATS keyword match fails on misspelled skills.',
      detail:
        spelling.length > 0
          ? `We found ${spelling.length} likely misspelling${spelling.length === 1 ? '' : 's'} in your resume.`
          : 'No common misspellings detected.',
      passText: `We scanned all ${wordCount} words against common resume misspellings and found none.`,
      suggestions: spelling.map(({ found, suggestion }) => ({ found, suggestion })),
      quotes: spelling.map((s) => ({ text: s.context })),
    },
    {
      id: 'content-bullets',
      weaknessId: 'bulletQuality',
      criterionKey: 'bulletQuality',
      label: 'Bullets Consistency',
      score: b.bulletQuality.score,
      status: criterionStatus(b.bulletQuality.score),
      summary: statusSummary(
        criterionStatus(b.bulletQuality.score),
        bulletEvidence.length,
      ),
      education:
        'ATS and recruiters both scan bullets first. Bullets that are too short say nothing; long paragraphs get skipped entirely.',
      detail: b.bulletQuality.feedback,
      passText: 'Your bullets are well-sized — scannable for recruiters and parseable for ATS.',
      quotes: bulletEvidence.map((t) => ({ text: t })),
    },
    {
      id: 'content-skills',
      weaknessId: 'skillsOptimization',
      criterionKey: 'skillsOptimization',
      label: 'Skills Optimization',
      score: b.skillsOptimization.score,
      status: criterionStatus(b.skillsOptimization.score),
      summary: statusSummary(criterionStatus(b.skillsOptimization.score)),
      education:
        'ATS filters shortlist resumes by matching skill keywords. A clear skills section is the easiest place for it to find them.',
      detail: b.skillsOptimization.feedback,
      passText: 'Your skills section is clearly labeled and keyword-rich.',
      // Missing Skills section = absence evidence (UI shows "Not found")
      quotes: [],
    },
  ];

  const missingSections = sectionItems.filter((s) => !s.ok);
  const contactMissingCore = contactItems.filter(
    (c) =>
      (c.label === 'Email address' || c.label === 'Phone number') && !c.ok,
  );
  const contactMissingLinkedIn = contactItems.some(
    (c) => c.label === 'LinkedIn profile' && !c.ok,
  );
  const sectionChecks: AtsReportCheck[] = [
    {
      id: 'sec-essential',
      weaknessId: 'sectionStructure',
      criterionKey: 'sectionStructure',
      label: 'Essential Sections',
      score: b.sectionStructure.score,
      status: criterionStatus(b.sectionStructure.score),
      summary: statusSummary(
        criterionStatus(b.sectionStructure.score),
        missingSections.length,
      ),
      education:
        'ATS systems map your resume into standard sections. Missing or oddly named headings mean whole blocks of your experience get skipped.',
      detail: b.sectionStructure.feedback,
      passText: `We found all the standard sections: ${sectionItems.filter((s) => s.ok).map((s) => s.label).join(', ')}.`,
      foundItems: sectionItems,
      quotes: [],
    },
    {
      id: 'sec-contact',
      weaknessId: 'contactInfo',
      criterionKey: 'contactInfo',
      label: 'Contact Information',
      score: b.contactInfo.score,
      status: criterionStatus(b.contactInfo.score),
      summary: statusSummary(
        criterionStatus(b.contactInfo.score),
        contactItems.filter((c) => !c.ok).length,
      ),
      education: contactMissingCore.length
        ? 'Recruiters spend seconds looking for a way to reach you. Missing phone or email is the fastest way to lose an interested reader.'
        : contactMissingLinkedIn
          ? 'Phone and email look fine — add LinkedIn so recruiters can verify you quickly.'
          : 'Recruiters spend seconds looking for a way to reach you. Keep phone, email, and LinkedIn easy to find.',
      detail: b.contactInfo.feedback,
      passText: 'Your contact details are complete and easy to find.',
      foundItems: contactItems,
      quotes:
        b.contactInfo.score < NEEDS_WORK_BELOW
          ? topLines.slice(0, 3).map((t) => ({ text: t }))
          : [],
    },
  ];

  const atsChecks: AtsReportCheck[] = [
    {
      id: 'ats-format',
      weaknessId: 'formatCleanliness',
      criterionKey: 'formatCleanliness',
      label: 'Design & Format',
      score: b.formatCleanliness.score,
      status: criterionStatus(b.formatCleanliness.score),
      summary: statusSummary(
        criterionStatus(b.formatCleanliness.score),
        formatLines.length,
      ),
      education:
        'Fancy characters, tables and text boxes confuse ATS parsers. Clean, simple formatting keeps every line readable.',
      detail: result.fileHints?.formatAdvice
        ? `${b.formatCleanliness.feedback} ${result.fileHints.formatAdvice}`
        : b.formatCleanliness.feedback,
      passText: 'No formatting traps found — your layout parses cleanly.',
      quotes: formatLines.map((t) => ({ text: t })),
    },
    {
      id: 'ats-dates',
      weaknessId: 'dateConsistency',
      criterionKey: 'dateConsistency',
      label: 'Dates & Links',
      score: b.dateConsistency.score,
      status: criterionStatus(b.dateConsistency.score),
      summary: statusSummary(criterionStatus(b.dateConsistency.score), weakDates.length),
      education:
        'ATS systems calculate your years of experience from dates. “2021 – 2023” without months can shortchange you by almost a year.',
      detail: b.dateConsistency.feedback,
      passText: 'Your dates use a consistent Month Year format — ATS can compute your experience correctly.',
      quotes: weakDates.map((t) => ({ text: t })),
    },
    {
      id: 'ats-length',
      weaknessId: 'lengthReadability',
      criterionKey: 'lengthReadability',
      label: 'Length & Density',
      score: b.lengthReadability.score,
      status: criterionStatus(b.lengthReadability.score),
      summary: statusSummary(criterionStatus(b.lengthReadability.score)),
      education:
        'Recruiters give a resume 6–8 seconds on the first pass. The right length and white space decide whether they keep reading.',
      detail: b.lengthReadability.feedback,
      passText: `At ${wordCount} words, your resume length sits in the readable range.`,
    },
  ];

  if (result.fileHints) {
    const fq = result.fileHints.formatQuality;
    const fileStatus: AtsReportCheckStatus =
      fq === 'best' || fq === 'good' ? 'pass' : fq === 'poor' ? 'fail' : 'warn';
    atsChecks.unshift({
      id: 'ats-file',
      criterionKey: 'formatCleanliness',
      label: 'File Format & Size',
      status: fileStatus,
      summary: statusSummary(fileStatus),
      education:
        'PDF and DOCX parse best. Exotic formats (.pages, scanned images) often reach the ATS as empty files.',
      detail:
        result.fileHints.formatAdvice ??
        `Detected .${result.fileHints.extension || 'unknown'} upload.`,
      passText: `You uploaded a .${result.fileHints.extension || 'pdf'} file — a format every major ATS reads reliably.`,
    });
  }

  const premium = buildPremiumHeuristics(resumeText, result);

  const freeContentScore = avg([
    parsePct,
    b.quantifiableAchievements.score,
    repetitionScore,
    spellingScore,
    b.bulletQuality.score,
    b.skillsOptimization.score,
  ]);
  const freeSectionsScore = avg([b.sectionStructure.score, b.contactInfo.score]);
  const freeAtsScore = avg([
    b.formatCleanliness.score,
    b.dateConsistency.score,
    b.lengthReadability.score,
  ]);

  const categories: AtsReportCategory[] = [
    {
      id: 'content',
      label: 'Content',
      tier: 'free',
      score: freeContentScore,
      locked: false,
      issueCount: contentChecks.filter((c) => c.status !== 'pass').length,
      checks: contentChecks,
    },
    {
      id: 'sections',
      label: 'Sections',
      tier: 'free',
      score: freeSectionsScore,
      locked: false,
      issueCount: sectionChecks.filter((c) => c.status !== 'pass').length,
      checks: sectionChecks,
    },
    {
      id: 'ats_essentials',
      label: 'ATS Essentials',
      tier: 'free',
      score: freeAtsScore,
      locked: false,
      issueCount: atsChecks.filter((c) => c.status !== 'pass').length,
      checks: atsChecks,
    },
    {
      id: 'hr',
      label: 'HR Red Flags',
      tier: 'premium',
      score: isPremium
        ? avg(
            premium.hr
              .filter((c) => c.status !== 'locked')
              .map((c) => (c.status === 'pass' ? 85 : c.status === 'warn' ? 60 : 40)),
          )
        : 69,
      locked: !isPremium,
      issueCount: isPremium ? premium.hr.filter((c) => c.status !== 'pass').length : 0,
      checks: isPremium
        ? premium.hr
        : [lockedCheck('hr-cred', 'Credibility'), lockedCheck('hr-int', 'Interview Risks')],
    },
    {
      id: 'discrimination',
      label: 'Bias Signals',
      tier: 'premium',
      score: isPremium
        ? avg(
            premium.discrimination.map((c) =>
              c.status === 'pass' ? 88 : c.status === 'warn' ? 62 : 45,
            ),
          )
        : 54,
      locked: !isPremium,
      issueCount: isPremium
        ? premium.discrimination.filter((c) => c.status !== 'pass').length
        : 0,
      checks: isPremium
        ? premium.discrimination
        : [
            lockedCheck('disc-age', 'Ageism & Date Bias'),
            lockedCheck('disc-gaps', 'Employment Gaps'),
          ],
    },
    {
      id: 'seniority',
      label: 'Seniority',
      tier: 'premium',
      score: isPremium
        ? avg(
            premium.seniority.map((c) =>
              c.status === 'pass' ? 82 : c.status === 'warn' ? 58 : 42,
            ),
          )
        : 57,
      locked: !isPremium,
      issueCount: isPremium ? premium.seniority.filter((c) => c.status !== 'pass').length : 0,
      checks: isPremium
        ? premium.seniority
        : [
            lockedCheck('sen-prog', 'Career Progression'),
            lockedCheck('sen-lead', 'Leadership Signals'),
          ],
    },
    {
      id: 'tailoring',
      label: 'Tailoring',
      tier: 'premium',
      score: isPremium
        ? result.jdMatch?.matchScore ??
          avg(
            premium.tailoring.map((c) =>
              c.status === 'pass' ? 80 : c.status === 'warn' ? 55 : 40,
            ),
          )
        : null,
      locked: !isPremium,
      issueCount: isPremium ? premium.tailoring.filter((c) => c.status !== 'pass').length : 0,
      checks: isPremium
        ? premium.tailoring
        : [
            // Shallow free teaser when JD exists — still marked locked for deep report
            ...(result.jdMatch
              ? [
                  {
                    id: 'tailor-teaser',
                    criterionKey: 'jdKeywords' as const,
                    label: 'Hard Skills (preview)',
                    status: 'locked' as const,
                    summary: `${result.jdMatch.matchScore}% match`,
                    detail: `Free preview: ${result.jdMatch.matched.length} matched, ${result.jdMatch.missing.length} missing. Unlock Premium for full Tailoring.`,
                  },
                ]
              : []),
            lockedCheck('tailor-soft', 'Soft Skills'),
            lockedCheck('tailor-verbs', 'Action Verbs'),
            lockedCheck('tailor-title', 'Tailored Title'),
          ],
    },
  ];

  const issueCount = categories
    .filter((c) => !c.locked)
    .reduce((n, c) => n + c.issueCount, 0);

  return {
    overallScore: result.overallScore,
    issueCount,
    parseRatePercent: parsePct,
    categories,
  };
}

export function criterionLabel(key: AtsCriterionKey): string {
  return ATS_CRITERION_LABELS[key];
}
