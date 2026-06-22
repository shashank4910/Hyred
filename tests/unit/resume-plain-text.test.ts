import { describe, expect, it } from 'vitest';
import { sanitizeResumePlainText } from '@/lib/resume-plain-text';
import { parseResumePlainText } from '@/lib/pdf-resume';

describe('sanitizeResumePlainText', () => {
  it('strips non-breaking hyphen that breaks jsPDF line rendering', () => {
    const raw = 'high\u2011traffic retail platform';
    expect(sanitizeResumePlainText(raw)).toBe('high-traffic retail platform');
  });

  it('normalizes thin spaces and unicode minus', () => {
    const raw = 'load\u2009testing and \u221210% gain';
    expect(sanitizeResumePlainText(raw)).toBe('load testing and -10% gain');
  });

  it('keeps normal ASCII prose unchanged', () => {
    const raw = 'Performance Testing Engineer with 7.7 years in BFSI.';
    expect(sanitizeResumePlainText(raw)).toBe(raw);
  });
});

describe('parseResumePlainText unicode safety', () => {
  it('normalizes body lines before parsing', () => {
    const text = `SHASHANK SINGH
PERFORMANCE TESTER
email@test.com
PROFESSIONAL SUMMARY
Delivering a 30% improvement for a high\u2011traffic retail platform.
`;
    const parsed = parseResumePlainText(text);
    const body = parsed.sections.flatMap((s) => s.lines).join('\n');
    expect(body).toMatch(/high-traffic retail platform/i);
    expect(body).not.toMatch(/h i g h/);
  });
});
