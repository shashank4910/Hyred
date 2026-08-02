import {
  DEFAULT_ATS_TEMPLATE_ID,
  listSelectableResumeThemes,
  type ResumeTemplateId,
} from '@/lib/resume-template-theme';

export type ResumeTemplateTier = 'free' | 'premium';

export type ResumeTemplateMeta = {
  id: string;
  name: string;
  tier: ResumeTemplateTier;
  blurb: string;
  /** When false, picker shows "Coming soon". */
  available: boolean;
};

/** Live ATS-safe themes from resume-template-theme, plus a few coming-soon slots. */
export const RESUME_TEMPLATES: ResumeTemplateMeta[] = [
  ...listSelectableResumeThemes().map((t) => ({
    id: t.id,
    name: t.name,
    tier: 'free' as const,
    blurb: t.blurb,
    available: true,
  })),
  { id: 'compact-one-page', name: 'Compact One Page', tier: 'free', blurb: 'Tight spacing for seniors', available: false },
  { id: 'tech-stack', name: 'Tech Stack', tier: 'premium', blurb: 'Skills band up top', available: false },
  { id: 'consulting', name: 'Consulting', tier: 'premium', blurb: 'McKinsey-style headers', available: false },
  { id: 'creative-lite', name: 'Creative Lite', tier: 'premium', blurb: 'Subtle color, still ATS-safe', available: false },
  { id: 'two-column-skills', name: 'Skills Split', tier: 'premium', blurb: 'Skills left, experience right', available: false },
  { id: 'international', name: 'International', tier: 'premium', blurb: 'EU-style compact contact', available: false },
];

export const DEFAULT_RESUME_TEMPLATE_ID: ResumeTemplateId = DEFAULT_ATS_TEMPLATE_ID;

export function getResumeTemplate(id: string): ResumeTemplateMeta | undefined {
  return RESUME_TEMPLATES.find((t) => t.id === id);
}
