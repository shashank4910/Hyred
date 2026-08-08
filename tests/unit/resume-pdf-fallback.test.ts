import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import { parseResume } from '@/lib/resume';

/**
 * Optional local fixture — the owner's PDF that pdf-parse-fork rejects
 * with "bad XRef" / "Illegal character". Skipped in CI when absent.
 */
const LOCAL_XREF_PDF = join(
  process.env.USERPROFILE || process.env.HOME || '',
  'Downloads',
  'SHASHANK_Performance_7.8yrs (1).pdf',
);

describe('parseResume PDF fallback', () => {
  it('extracts text via unpdf when pdf-parse-fork fails (local fixture)', async () => {
    if (!existsSync(LOCAL_XREF_PDF)) return;

    const buffer = readFileSync(LOCAL_XREF_PDF);
    const text = await parseResume({
      buffer,
      filename: 'SHASHANK_Performance_7.8yrs (1).pdf',
      mimeType: 'application/pdf',
    });

    expect(text.length).toBeGreaterThan(500);
    expect(text).toMatch(/SHASHANK/i);
    expect(text).toMatch(/Performance/i);
  });
});
