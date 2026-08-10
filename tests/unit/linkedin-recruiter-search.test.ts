import { describe, expect, it } from 'vitest';
import { buildLinkedInRecruiterUrl } from '@/lib/linkedin-people-search';

describe('buildLinkedInRecruiterUrl', () => {
  it('encodes opening quotes so href cannot strip them', () => {
    const url = buildLinkedInRecruiterUrl('RxLogix Corporation');
    const keywords = new URL(url).searchParams.get('keywords') ?? '';
    expect(keywords.startsWith('"')).toBe(true);
    expect(keywords).toContain('"RxLogix Corporation"');
    expect(keywords).toContain('(recruiter OR');
    expect(keywords).toContain('"talent acquisition"');
    // Must be percent-encoded in the raw href (leading " safe inside attribute)
    expect(url).toContain('keywords=%22');
    expect(url).not.toMatch(/keywords="/);
  });

  it('does not restrict to 1st/2nd network (avoids empty recruiting results)', () => {
    const url = buildLinkedInRecruiterUrl('RxLogix Corporation');
    expect(url).not.toContain('network=');
  });
});
