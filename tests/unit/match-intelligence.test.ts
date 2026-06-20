import { describe, expect, it } from 'vitest';
import { normalizeVerdictResult } from '@/lib/match-intelligence';

describe('normalizeVerdictResult', () => {
  it('forces verdict into the allowed set', () => {
    const result = normalizeVerdictResult({
      verdict: 'maybe',
      seniorityFit: 'unknown',
      reasons: ['Reason 1', 'Reason 2'],
      actions: ['Action 1'],
    });

    expect(result.verdict).toBe('stretch');
    expect(result.seniorityFit).toBe('calibrated');
  });

  it('keeps only the first three reasons and actions', () => {
    const result = normalizeVerdictResult({
      verdict: 'apply',
      seniorityFit: 'underqualified',
      reasons: ['1', '2', '3', '4'],
      actions: ['a', 'b', 'c', 'd'],
    });

    expect(result.reasons).toHaveLength(3);
    expect(result.actions).toHaveLength(3);
  });

  it('passes valid verdicts through unchanged', () => {
    expect(normalizeVerdictResult({ verdict: 'apply' }).verdict).toBe('apply');
    expect(normalizeVerdictResult({ verdict: 'skip' }).verdict).toBe('skip');
    expect(normalizeVerdictResult({ verdict: 'stretch' }).verdict).toBe('stretch');
  });

  it('passes valid seniorityFit values through unchanged', () => {
    expect(normalizeVerdictResult({ seniorityFit: 'underqualified' }).seniorityFit).toBe('underqualified');
    expect(normalizeVerdictResult({ seniorityFit: 'overqualified' }).seniorityFit).toBe('overqualified');
    expect(normalizeVerdictResult({ seniorityFit: 'calibrated' }).seniorityFit).toBe('calibrated');
  });

  it('returns empty arrays for missing reasons and actions', () => {
    const result = normalizeVerdictResult({ verdict: 'skip' });
    expect(result.reasons).toEqual([]);
    expect(result.actions).toEqual([]);
  });
});
