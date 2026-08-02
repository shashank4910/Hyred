import type { ResumeDocument, ResumeLine, ResumeSection } from '@/lib/resume-document';

export type ResumeLayoutModel = {
  name: ResumeLine | null;
  title: ResumeLine | null;
  contactLines: ResumeLine[];
  summaryText: ResumeSection | null;
  experienceSections: ResumeSection[];
  educationSections: ResumeSection[];
  skillsSections: ResumeSection[];
  certificationsSections: ResumeSection[];
  languagesSections: ResumeSection[];
  otherSections: ResumeSection[];
};

const SUMMARY_HEADING =
  /^(professional\s+summary|summary|objective|career\s+objective|profile|professional\s+profile|summary\s+of\s+qualifications)\s*:?\s*$/i;

const EXPERIENCE_HEADING =
  /^(professional\s+experience|work\s+experience|experience|employment(\s+history)?|work\s+history|projects?)\s*:?\s*$/i;

const EDUCATION_HEADING = /^education\s*:?\s*$/i;

const SKILLS_HEADING =
  /^(technical\s+skills|skills|core\s+competencies|key\s+skills)\s*:?\s*$/i;

const CERTIFICATIONS_HEADING = /^(certifications?|licenses?|credentials?)\s*:?\s*$/i;

const LANGUAGES_HEADING = /^languages?\s*:?\s*$/i;

function sectionHeadingText(section: ResumeSection): string {
  return section.heading?.text.trim() ?? '';
}

function classifySection(section: ResumeSection): keyof Pick<
  ResumeLayoutModel,
  | 'summaryText'
  | 'experienceSections'
  | 'educationSections'
  | 'skillsSections'
  | 'certificationsSections'
  | 'languagesSections'
  | 'otherSections'
> {
  const h = sectionHeadingText(section);
  if (!h) return 'otherSections';
  if (SUMMARY_HEADING.test(h)) return 'summaryText';
  if (EXPERIENCE_HEADING.test(h)) return 'experienceSections';
  if (EDUCATION_HEADING.test(h)) return 'educationSections';
  if (SKILLS_HEADING.test(h)) return 'skillsSections';
  if (CERTIFICATIONS_HEADING.test(h)) return 'certificationsSections';
  if (LANGUAGES_HEADING.test(h)) return 'languagesSections';
  return 'otherSections';
}

function looksLikeTitle(line: ResumeLine): boolean {
  const t = line.text.trim();
  if (t.length > 90 || /@|\+?\d[\d\s()-]{6,}|linkedin|github|http/i.test(t)) return false;
  return true;
}

/** Split parsed resume document into layout-friendly buckets. */
export function buildResumeLayoutModel(doc: ResumeDocument): ResumeLayoutModel {
  const model: ResumeLayoutModel = {
    name: doc.name,
    title: null,
    contactLines: [],
    summaryText: null,
    experienceSections: [],
    educationSections: [],
    skillsSections: [],
    certificationsSections: [],
    languagesSections: [],
    otherSections: [],
  };

  const contact = [...doc.contact];
  if (contact[0] && looksLikeTitle(contact[0])) {
    const rest = contact.slice(1);
    if (rest.length === 0 || rest.some((c) => /@|\d{6,}|linkedin|github|,/i.test(c.text))) {
      model.title = contact.shift() ?? null;
    }
  }
  model.contactLines = contact;

  for (const section of doc.sections) {
    const bucket = classifySection(section);
    if (bucket === 'summaryText') {
      if (!model.summaryText) model.summaryText = section;
      else model.otherSections.push(section);
    } else {
      model[bucket].push(section);
    }
  }

  return model;
}

/** Initials from a display name (max 2 chars). */
export function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}
