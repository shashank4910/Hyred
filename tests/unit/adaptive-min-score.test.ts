import { describe, expect, it } from 'vitest';
import {
  ADAPTIVE_MATCH_TARGET,
  buildAdaptiveThresholds,
  matchesToSaveAfterWiden,
  pickAdaptiveThreshold,
} from '@/lib/adaptive-min-score';

describe('buildAdaptiveThresholds', () => {
  it('includes user min, 60, and 50 for a 70 setting', () => {
    expect(buildAdaptiveThresholds(70)).toEqual([70, 60, 50]);
  });
});

describe('pickAdaptiveThreshold', () => {
  const pending = [
    { finalScore: 72, jobId: 'a' },
    { finalScore: 68, jobId: 'b' },
    { finalScore: 62, jobId: 'c' },
    { finalScore: 55, jobId: 'd' },
  ];

  it('does not widen when user min already has enough matches', () => {
    const many = Array.from({ length: 30 }, (_, i) => ({
      finalScore: 70 + (i % 5),
      jobId: String(i),
    }));
    expect(pickAdaptiveThreshold(many, 70)).toEqual({
      threshold: 70,
      shouldWiden: false,
    });
  });

  it('steps down to 60 when 70+ is sparse but 60+ is enough', () => {
    const pool = [
      ...Array.from({ length: 2 }, (_, i) => ({ finalScore: 71, jobId: `h${i}` })),
      ...Array.from({ length: 30 }, (_, i) => ({ finalScore: 62, jobId: `m${i}` })),
    ];
    expect(pickAdaptiveThreshold(pool, 70, ADAPTIVE_MATCH_TARGET)).toEqual({
      threshold: 60,
      shouldWiden: true,
    });
  });

  it('falls back to floor when nothing reaches the target', () => {
    expect(pickAdaptiveThreshold(pending, 70, ADAPTIVE_MATCH_TARGET)).toEqual({
      threshold: 50,
      shouldWiden: true,
    });
  });
});

describe('matchesToSaveAfterWiden', () => {
  it('returns only not-yet-saved jobs at the widened threshold', () => {
    const pending = [
      { finalScore: 72, jobId: 'saved' },
      { finalScore: 65, jobId: 'new1' },
      { finalScore: 58, jobId: 'new2' },
      { finalScore: 45, jobId: 'junk' },
    ];
    const saved = new Set(['saved']);
    const result = matchesToSaveAfterWiden(pending, 70, saved, ADAPTIVE_MATCH_TARGET);
    expect(result.shouldWiden).toBe(true);
    expect(result.threshold).toBe(50);
    expect(result.toSave.map((m) => m.jobId)).toEqual(['new1', 'new2']);
  });
});
