import { describe, expect, it } from 'vitest';
import { buildProposedChanges, type StudioAnalysis } from '@/lib/match-studio';

function makeAnalysis(overrides: Partial<StudioAnalysis> = {}): StudioAnalysis {
  return {
    robotScore: 60,
    humanScore: 50,
    verdictLine: 'Solid match, but you hide the right work.',
    hooks: [],
    watchOuts: [],
    requirements: [],
    preselected: [],
    analyzedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('buildProposedChanges', () => {
  it('turns inferred requirements with a suggestion into accepted reframes', () => {
    const analysis = makeAnalysis({
      requirements: [
        {
          keyword: 'load testing',
          type: 'activity',
          weight: 'must',
          state: 'inferred',
          evidence: 'shows heap profiling under soak runs',
          suggestion: 'Ran load tests with JMeter and profiled JVM memory under soak.',
        },
      ],
      preselected: ['load testing'],
    });

    const reframes = buildProposedChanges(analysis).filter((c) => c.kind === 'reframe');
    expect(reframes).toHaveLength(1);
    expect(reframes[0].keyword).toBe('load testing');
    expect(reframes[0].suggested).toBe(
      'Ran load tests with JMeter and profiled JVM memory under soak.',
    );
    expect(reframes[0].accepted).toBe(true);
  });

  it('omits reframes for inferred items that lack a suggestion (honest, no invention)', () => {
    const analysis = makeAnalysis({
      requirements: [
        {
          keyword: 'Garbage Collection',
          type: 'concept',
          weight: 'nice',
          state: 'inferred',
          evidence: 'adjacent heap analysis present',
          // no suggestion on purpose
        },
      ],
    });

    const reframes = buildProposedChanges(analysis).filter((c) => c.kind === 'reframe');
    expect(reframes).toHaveLength(0);
  });

  it('turns absent must-haves into un-accepted missing warnings', () => {
    const analysis = makeAnalysis({
      requirements: [
        {
          keyword: 'Gatling',
          type: 'tool',
          weight: 'must',
          state: 'absent',
        },
      ],
    });

    const missing = buildProposedChanges(analysis).filter((c) => c.kind === 'missing');
    expect(missing).toHaveLength(1);
    expect(missing[0].keyword).toBe('Gatling');
    expect(missing[0].accepted).toBe(false);
    expect(missing[0].suggested).toBeUndefined();
  });

  it('passes proven requirements through as no-op (they need no change)', () => {
    const analysis = makeAnalysis({
      requirements: [
        {
          keyword: 'JMeter',
          type: 'tool',
          weight: 'must',
          state: 'proven',
        },
      ],
    });

    const changes = buildProposedChanges(analysis);
    expect(changes.filter((c) => c.kind === 'reframe')).toHaveLength(0);
    expect(changes.filter((c) => c.kind === 'missing')).toHaveLength(0);
  });

  it('gives each change a stable id keyed to kind + keyword', () => {
    const analysis = makeAnalysis({
      requirements: [
        {
          keyword: 'k6',
          type: 'tool',
          weight: 'must',
          state: 'inferred',
          evidence: 'load-run evidence',
          suggestion: 'Ran 60 rps k6 load tests.',
        },
        {
          keyword: 'NeoLoad',
          type: 'tool',
          weight: 'nice',
          state: 'absent',
        },
      ],
    });

    const ids = buildProposedChanges(analysis).map((c) => c.id);
    expect(ids).toContain('reframe-k6');
    expect(ids).toContain('missing-NeoLoad');
  });

  it('returns an empty list for a fully-proven analysis', () => {
    expect(buildProposedChanges(makeAnalysis())).toEqual([]);
  });

  it('pre-ticks nothing for missing warnings even when preselected overlaps', () => {
    const analysis = makeAnalysis({
      requirements: [
        {
          keyword: 'JMeter',
          type: 'tool',
          weight: 'must',
          state: 'absent',
        },
      ],
      preselected: ['JMeter'],
    });

    const missing = buildProposedChanges(analysis).filter((c) => c.kind === 'missing');
    expect(missing[0].accepted).toBe(false); // honest: do not auto-claim a tool you lack
  });
});