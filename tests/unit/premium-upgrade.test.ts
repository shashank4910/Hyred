import { describe, expect, it } from 'vitest';
import { formatResumeStudioMeter, PREMIUM_UPGRADE_PATH } from '@/lib/premium-upgrade';

describe('formatResumeStudioMeter', () => {
  it('describes free remaining credits', () => {
    expect(formatResumeStudioMeter({ used: 1, limit: 3, remaining: 2 }, 'free')).toBe(
      '2 of 3 free Resume Studio credits left',
    );
    expect(formatResumeStudioMeter({ used: 2, limit: 3, remaining: 1 }, 'free')).toBe(
      '1 of 3 free Resume Studio credits left',
    );
  });

  it('describes premium remaining credits without free wording', () => {
    expect(
      formatResumeStudioMeter({ used: 5, limit: 40, remaining: 35 }, 'premium_sprint'),
    ).toBe('35 of 40 Resume Studio credits left');
  });
});

describe('PREMIUM_UPGRADE_PATH', () => {
  it('points at Settings upgrade placeholder for Stripe later', () => {
    expect(PREMIUM_UPGRADE_PATH).toBe('/settings?upgrade=resume_studio');
  });
});
