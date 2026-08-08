import { describe, expect, it } from 'vitest';
import { resumeObjectPath } from '@/lib/resume-storage';

describe('resumeObjectPath', () => {
  it('returns bare storage paths unchanged', () => {
    expect(
      resumeObjectPath('a1b2c3d4-e5f6-7890-abcd-ef1234567890/match-name.pdf'),
    ).toBe('a1b2c3d4-e5f6-7890-abcd-ef1234567890/match-name.pdf');
  });

  it('strips leading slashes from paths', () => {
    expect(resumeObjectPath('/folder/file.pdf')).toBe('folder/file.pdf');
  });

  it('extracts path from legacy public URLs', () => {
    const url =
      'https://xyz.supabase.co/storage/v1/object/public/resumes/pid/job-resume.pdf';
    expect(resumeObjectPath(url)).toBe('pid/job-resume.pdf');
  });

  it('extracts path from signed URLs (ignores query token)', () => {
    const url =
      'https://xyz.supabase.co/storage/v1/object/sign/resumes/pid/job.pdf?token=abc.def';
    expect(resumeObjectPath(url)).toBe('pid/job.pdf');
  });

  it('returns null for empty / unrelated values', () => {
    expect(resumeObjectPath(null)).toBeNull();
    expect(resumeObjectPath('')).toBeNull();
    expect(resumeObjectPath('https://example.com/not-storage.pdf')).toBeNull();
  });
});
