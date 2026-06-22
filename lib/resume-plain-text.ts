/**
 * Plain-text resume sanitization for ATS output + jsPDF rendering.
 *
 * jsPDF Helvetica only encodes WinAnsi/Latin-1. A single unencodable Unicode
 * char (non-breaking hyphen U+2011, thin space U+2009, unicode minus U+2212…)
 * corrupts the ENTIRE PDF line into spaced-out letters ("h i g h t r a f f i c").
 *
 * Used by lib/pdf-resume.ts (PDF) and lib/gemini.ts (LLM output normalize).
 */

/** Normalize resume plain text to safe printable ASCII for jsPDF + ATS parsers. */
export function sanitizeResumePlainText(s: string): string {
  return s
    // Dashes / hyphens — many Unicode hyphen code points are NOT WinAnsi-safe.
    .replace(/[\u2010-\u2015\u2212\uFE58\uFE63\uFF0D]/g, '-')
    // Fancy spaces — thin/narrow/no-break spaces break jsPDF line rendering.
    .replace(/[\u00A0\u1680\u180E\u2000-\u200B\u202F\u205F\u3000]/g, ' ')
    // Smart quotes
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
    // Bullets
    .replace(/[\u2022\u25CF\u25E6\u2043\u00B7]/g, '-')
    // Arrows (Latin-1 can't represent these — jsPDF mangles the whole line)
    .replace(/[\u2192\u21D2\u2794\u2799\u279C\u279E\u27A1\u2B95\u27F6\u21FE]/g, '->')
    .replace(/[\u2190\u21D0\u27F5]/g, '<-')
    .replace(/[\u2194\u21D4\u27F7]/g, '<->')
    .replace(/\u2026/g, '...')
  // Common Latin letters → ASCII (names, cities)
    .replace(/[àáâãäå]/g, 'a')
    .replace(/[ÀÁÂÃÄÅ]/g, 'A')
    .replace(/[èéêë]/g, 'e')
    .replace(/[ÈÉÊË]/g, 'E')
    .replace(/[ìíîï]/g, 'i')
    .replace(/[ÌÍÎÏ]/g, 'I')
    .replace(/[òóôõö]/g, 'o')
    .replace(/[ÒÓÔÕÖ]/g, 'O')
    .replace(/[ùúûü]/g, 'u')
    .replace(/[ÙÚÛÜ]/g, 'U')
    .replace(/[ñ]/g, 'n')
    .replace(/[Ñ]/g, 'N')
    .replace(/[ç]/g, 'c')
    .replace(/[Ç]/g, 'C')
    .replace(/[ß]/g, 'ss')
    .replace(/[œ]/g, 'oe')
    .replace(/[Œ]/g, 'OE')
    .replace(/[æ]/g, 'ae')
    .replace(/[Æ]/g, 'AE')
    // Drop anything else outside printable ASCII (keep tab + newline).
    .replace(/[^\t\n\r\x20-\x7E]/g, '')
    // Collapse runs of spaces/tabs (LLM sometimes emits wide gaps).
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/ +\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n');
}
