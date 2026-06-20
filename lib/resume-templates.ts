export type ResumeTemplateTier = 'free' | 'premium';

export type ResumeTemplateMeta = {
  id: string;
  name: string;
  tier: ResumeTemplateTier;
  blurb: string;
  /** When false, picker shows "Coming soon" — PDF still uses classic-navy. */
  available: boolean;
};

/** Registry for Resume Studio template picker. Only `classic-navy` renders PDF today. */
export const RESUME_TEMPLATES: ResumeTemplateMeta[] = [
  { id: 'classic-navy', name: 'Classic Navy', tier: 'free', blurb: 'ATS navy header (default)', available: true },
  { id: 'clean-minimal', name: 'Clean Minimal', tier: 'free', blurb: 'Single column, no color band', available: false },
  { id: 'modern-teal', name: 'Modern Teal', tier: 'free', blurb: 'Hyred accent sidebar', available: false },
  { id: 'compact-one-page', name: 'Compact One Page', tier: 'free', blurb: 'Tight spacing for seniors', available: false },
  { id: 'executive', name: 'Executive', tier: 'free', blurb: 'Bold name, subtle rules', available: false },
  { id: 'tech-stack', name: 'Tech Stack', tier: 'premium', blurb: 'Skills band up top', available: false },
  { id: 'consulting', name: 'Consulting', tier: 'premium', blurb: 'McKinsey-style headers', available: false },
  { id: 'creative-lite', name: 'Creative Lite', tier: 'premium', blurb: 'Subtle color, still ATS-safe', available: false },
  { id: 'two-column-skills', name: 'Skills Split', tier: 'premium', blurb: 'Skills left, experience right', available: false },
  { id: 'international', name: 'International', tier: 'premium', blurb: 'EU-style compact contact', available: false },
];

export const DEFAULT_RESUME_TEMPLATE_ID = 'classic-navy';

export function getResumeTemplate(id: string): ResumeTemplateMeta | undefined {
  return RESUME_TEMPLATES.find((t) => t.id === id);
}
