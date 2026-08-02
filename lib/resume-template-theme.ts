/**
 * ATS-safe resume visual themes for PDF + on-screen preview.
 * Six distinct structural layouts (Hyred-original recreations).
 */

export type ResumeTemplateId =
  | 'teal-engineer'
  | 'navy-gold-sales'
  | 'modern-summary'
  | 'nursing-clean'
  | 'blue-border-pro'
  | 'peach-executive';

export type ResumeLayoutKind =
  | 'teal-sidebar'
  | 'navy-gold'
  | 'modern-summary'
  | 'nursing-clean'
  | 'blue-border'
  | 'peach-sidebar';

export type ResumeHeaderStyle = 'light' | 'band';

export type ResumeThemeCss = {
  name: string;
  title: string;
  contact: string;
  section: string;
  ink: string;
  stone: string;
  /** Sidebar / accent backgrounds */
  sidebarBg?: string;
  sidebarInk?: string;
  accent?: string;
  accentLight?: string;
  summaryBand?: string;
  border?: string;
  pillBg?: string;
  pillText?: string;
  bandBg?: string;
  bandName?: string;
  bandTitle?: string;
  bandContact?: string;
  bandAccent?: string;
};

export type ResumeThemePdf = {
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

export type ResumeTheme = {
  id: ResumeTemplateId;
  name: string;
  blurb: string;
  layout: ResumeLayoutKind;
  headerStyle: ResumeHeaderStyle;
  css: ResumeThemeCss;
  pdf: ResumeThemePdf;
};

export const RESUME_THEMES: Record<ResumeTemplateId, ResumeTheme> = {
  'teal-engineer': {
    id: 'teal-engineer',
    name: 'Teal Engineer',
    blurb: 'Pale teal sidebar · circular avatar · two-column',
    layout: 'teal-sidebar',
    headerStyle: 'light',
    css: {
      name: '#006B6B',
      title: '#006B6B',
      contact: '#334155',
      section: '#006B6B',
      ink: '#1e293b',
      stone: '#64748b',
      sidebarBg: '#EBF5F5',
      sidebarInk: '#0f4c4c',
      accent: '#006B6B',
    },
    pdf: {
      name: [0, 107, 107],
      title: [0, 107, 107],
      contact: [51, 65, 85],
      section: [0, 107, 107],
      ink: [30, 41, 59],
      stone: [100, 116, 139],
    },
  },
  'navy-gold-sales': {
    id: 'navy-gold-sales',
    name: 'Navy & Gold',
    blurb: 'Dark navy band · gold title · skills sidebar',
    layout: 'navy-gold',
    headerStyle: 'band',
    css: {
      name: '#ffffff',
      title: '#D4AF37',
      contact: '#cbd5e1',
      section: '#0f172a',
      ink: '#0f172a',
      stone: '#505c6e',
      sidebarBg: '#E8F0F8',
      sidebarInk: '#0f172a',
      accent: '#D4AF37',
      bandBg: '#0f172a',
      bandName: '#ffffff',
      bandTitle: '#D4AF37',
      bandContact: '#cbd5e1',
      bandAccent: '#D4AF37',
    },
    pdf: {
      name: [255, 255, 255],
      title: [212, 175, 55],
      contact: [203, 213, 225],
      section: [15, 23, 42],
      ink: [15, 23, 42],
      stone: [80, 92, 110],
      bandBg: [15, 23, 42],
      bandName: [255, 255, 255],
      bandTitle: [212, 175, 55],
      bandContact: [203, 213, 225],
      bandAccent: [212, 175, 55],
    },
  },
  'modern-summary': {
    id: 'modern-summary',
    name: 'Modern Summary',
    blurb: 'Summary band · timeline experience · tan headings',
    layout: 'modern-summary',
    headerStyle: 'light',
    css: {
      name: '#1e293b',
      title: '#475569',
      contact: '#64748b',
      section: '#A67C52',
      ink: '#1e293b',
      stone: '#64748b',
      sidebarBg: '#f8fafc',
      summaryBand: '#E8EEF4',
      accent: '#A67C52',
    },
    pdf: {
      name: [30, 41, 59],
      title: [71, 85, 105],
      contact: [100, 116, 139],
      section: [166, 124, 82],
      ink: [30, 41, 59],
      stone: [100, 116, 139],
    },
  },
  'nursing-clean': {
    id: 'nursing-clean',
    name: 'Nursing Clean',
    blurb: 'Centered header · single column · blue rules',
    layout: 'nursing-clean',
    headerStyle: 'light',
    css: {
      name: '#111827',
      title: '#2563eb',
      contact: '#4b5563',
      section: '#2563eb',
      ink: '#1f2937',
      stone: '#6b7280',
      accent: '#2563eb',
    },
    pdf: {
      name: [17, 24, 39],
      title: [37, 99, 235],
      contact: [75, 85, 99],
      section: [37, 99, 235],
      ink: [31, 41, 55],
      stone: [107, 114, 128],
    },
  },
  'blue-border-pro': {
    id: 'blue-border-pro',
    name: 'Blue Border Pro',
    blurb: 'Blue page border · contact bar · skill pills',
    layout: 'blue-border',
    headerStyle: 'light',
    css: {
      name: '#1d4ed8',
      title: '#475569',
      contact: '#ffffff',
      section: '#1d4ed8',
      ink: '#1e293b',
      stone: '#64748b',
      border: '#2563eb',
      accent: '#2563eb',
      pillBg: '#dbeafe',
      pillText: '#1d4ed8',
      bandBg: '#2563eb',
    },
    pdf: {
      name: [29, 78, 216],
      title: [71, 85, 105],
      contact: [255, 255, 255],
      section: [29, 78, 216],
      ink: [30, 41, 59],
      stone: [100, 116, 139],
    },
  },
  'peach-executive': {
    id: 'peach-executive',
    name: 'Peach Executive',
    blurb: 'Peach sidebar · Georgia name · executive feel',
    layout: 'peach-sidebar',
    headerStyle: 'light',
    css: {
      name: '#5C4033',
      title: '#78716c',
      contact: '#44403c',
      section: '#5C4033',
      ink: '#292524',
      stone: '#78716c',
      sidebarBg: '#F5E6D3',
      sidebarInk: '#44403c',
      accent: '#A67C52',
    },
    pdf: {
      name: [92, 64, 51],
      title: [120, 113, 108],
      contact: [68, 64, 60],
      section: [92, 64, 51],
      ink: [41, 37, 36],
      stone: [120, 113, 108],
    },
  },
};

export const DEFAULT_ATS_TEMPLATE_ID: ResumeTemplateId = 'nursing-clean';

/** Map retired color-skin ids to closest new layout. */
const LEGACY_TEMPLATE_MAP: Record<string, ResumeTemplateId> = {
  'executive-clean': 'peach-executive',
  'classic-navy': 'navy-gold-sales',
  'modern-teal': 'teal-engineer',
  'clean-minimal': 'nursing-clean',
};

export function resolveResumeTheme(id?: string | null): ResumeTheme {
  if (id && id in RESUME_THEMES) return RESUME_THEMES[id as ResumeTemplateId];
  if (id && id in LEGACY_TEMPLATE_MAP) return RESUME_THEMES[LEGACY_TEMPLATE_MAP[id]!];
  return RESUME_THEMES[DEFAULT_ATS_TEMPLATE_ID];
}

export function listSelectableResumeThemes(): ResumeTheme[] {
  return [
    RESUME_THEMES['teal-engineer'],
    RESUME_THEMES['navy-gold-sales'],
    RESUME_THEMES['modern-summary'],
    RESUME_THEMES['nursing-clean'],
    RESUME_THEMES['blue-border-pro'],
    RESUME_THEMES['peach-executive'],
  ];
}
