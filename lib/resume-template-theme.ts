/**
 * ATS-safe resume visual themes for PDF + on-screen preview.
 * All themes stay single-column (no sidebars/tables) for parser safety.
 */

export type ResumeTemplateId =
  | 'executive-clean'
  | 'classic-navy'
  | 'modern-teal'
  | 'clean-minimal';

export type ResumeHeaderStyle = 'light' | 'band';

export type ResumeTheme = {
  id: ResumeTemplateId;
  name: string;
  blurb: string;
  headerStyle: ResumeHeaderStyle;
  /** Hex for CSS preview */
  css: {
    name: string;
    title: string;
    contact: string;
    section: string;
    ink: string;
    stone: string;
    bandBg?: string;
    bandName?: string;
    bandTitle?: string;
    bandContact?: string;
    bandAccent?: string;
  };
  /** RGB 0–255 for jsPDF */
  pdf: {
    name: [number, number, number];
    title: [number, number, number];
    contact: [number, number, number];
    section: [number, number, number];
    ink: [number, number, number];
    stone: [number, number, number];
    bandBg?: [number, number, number];
    bandName?: [number, number, number];
    bandTitle?: [number, number, number];
    bandContact?: [number, number, number];
    bandAccent?: [number, number, number];
  };
};

export const RESUME_THEMES: Record<ResumeTemplateId, ResumeTheme> = {
  'executive-clean': {
    id: 'executive-clean',
    name: 'Executive Clean',
    blurb: 'White header, navy accents — 2026 ATS favorite',
    headerStyle: 'light',
    css: {
      name: '#1B3A5C',
      title: '#64748b',
      contact: '#64748b',
      section: '#1B3A5C',
      ink: '#1e293b',
      stone: '#64748b',
    },
    pdf: {
      name: [27, 58, 92],
      title: [100, 116, 139],
      contact: [100, 116, 139],
      section: [27, 58, 92],
      ink: [30, 41, 59],
      stone: [100, 116, 139],
    },
  },
  'classic-navy': {
    id: 'classic-navy',
    name: 'Classic Navy',
    blurb: 'Bold navy band + amber title',
    headerStyle: 'band',
    css: {
      name: '#0f172a',
      title: '#eab308',
      contact: '#b4c3d7',
      section: '#0f172a',
      ink: '#0f172a',
      stone: '#505c6e',
      bandBg: '#0f172a',
      bandName: '#ffffff',
      bandTitle: '#eab308',
      bandContact: '#b4c3d7',
      bandAccent: '#eab308',
    },
    pdf: {
      name: [15, 23, 42],
      title: [234, 179, 8],
      contact: [180, 195, 215],
      section: [15, 23, 42],
      ink: [15, 23, 42],
      stone: [80, 92, 110],
      bandBg: [15, 23, 42],
      bandName: [255, 255, 255],
      bandTitle: [234, 179, 8],
      bandContact: [180, 195, 215],
      bandAccent: [234, 179, 8],
    },
  },
  'modern-teal': {
    id: 'modern-teal',
    name: 'Modern Teal',
    blurb: 'Hyred teal accents, clean white page',
    headerStyle: 'light',
    css: {
      name: '#0f766e',
      title: '#0d9488',
      contact: '#64748b',
      section: '#0f766e',
      ink: '#134e4a',
      stone: '#64748b',
    },
    pdf: {
      name: [15, 118, 110],
      title: [13, 148, 136],
      contact: [100, 116, 139],
      section: [15, 118, 110],
      ink: [19, 78, 74],
      stone: [100, 116, 139],
    },
  },
  'clean-minimal': {
    id: 'clean-minimal',
    name: 'Clean Minimal',
    blurb: 'Charcoal only — ultra sparse, max parse safety',
    headerStyle: 'light',
    css: {
      name: '#111827',
      title: '#4b5563',
      contact: '#6b7280',
      section: '#111827',
      ink: '#1f2937',
      stone: '#6b7280',
    },
    pdf: {
      name: [17, 24, 39],
      title: [75, 85, 99],
      contact: [107, 114, 128],
      section: [17, 24, 39],
      ink: [31, 41, 55],
      stone: [107, 114, 128],
    },
  },
};

export const DEFAULT_ATS_TEMPLATE_ID: ResumeTemplateId = 'executive-clean';

export function resolveResumeTheme(id?: string | null): ResumeTheme {
  if (id && id in RESUME_THEMES) return RESUME_THEMES[id as ResumeTemplateId];
  return RESUME_THEMES[DEFAULT_ATS_TEMPLATE_ID];
}

export function listSelectableResumeThemes(): ResumeTheme[] {
  return [
    RESUME_THEMES['executive-clean'],
    RESUME_THEMES['classic-navy'],
    RESUME_THEMES['modern-teal'],
    RESUME_THEMES['clean-minimal'],
  ];
}
