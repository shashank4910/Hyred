import { describe, expect, it } from 'vitest';
import {
  applySuggestion,
  findSnippetRange,
  listAtsWeaknesses,
  undoLastFix,
  type AppliedFix,
  type AtsFixSuggestion,
} from '@/lib/ats-fix';
import { checkAtsCompatibility } from '@/lib/ats-checker';
import { ATS_SAMPLE_RESUME } from '@/lib/ats-checker-samples';

describe('ats-fix apply/undo', () => {
  it('applies an exact snippet replace', () => {
    const resume = 'Hello\n- Built APIs\nWorld';
    const result = applySuggestion(resume, {
      originalSnippet: '- Built APIs',
      proposedText: '- Built REST APIs serving 1M users',
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.resume).toContain('- Built REST APIs serving 1M users');
      expect(result.resume).not.toContain('- Built APIs\n');
    }
  });

  it('matches snippets with flexible whitespace', () => {
    const resume = 'Line A\n-   Led  team\nLine B';
    const range = findSnippetRange(resume, '- Led team');
    expect(range).not.toBeNull();
    const result = applySuggestion(resume, {
      originalSnippet: '- Led team',
      proposedText: '- Led a cross-functional team of 5',
    });
    expect(result.ok).toBe(true);
  });

  it('fails when snippet is missing', () => {
    const result = applySuggestion('abc', {
      originalSnippet: 'not here',
      proposedText: 'x',
    });
    expect(result.ok).toBe(false);
  });

  it('undo restores previous resume', () => {
    const suggestion: AtsFixSuggestion = {
      id: '1',
      weaknessId: 'bulletQuality',
      criterionKey: 'bulletQuality',
      title: 't',
      rationale: 'r',
      originalSnippet: 'a',
      proposedText: 'b',
    };
    const applied: AppliedFix[] = [
      { suggestion, beforeResume: 'version-1' },
      { suggestion, beforeResume: 'version-2' },
    ];
    const undone = undoLastFix(applied);
    expect(undone?.resume).toBe('version-2');
    expect(undone?.applied).toHaveLength(1);
  });
});

describe('listAtsWeaknesses', () => {
  it('lists criteria and sorts needs_work first', () => {
    const result = checkAtsCompatibility(ATS_SAMPLE_RESUME);
    const weaknesses = listAtsWeaknesses(result);
    expect(weaknesses.length).toBeGreaterThanOrEqual(8);
    const needs = weaknesses.filter((w) => w.status === 'needs_work');
    const passing = weaknesses.filter((w) => w.status === 'passing');
    if (needs.length && passing.length) {
      const firstPassingIdx = weaknesses.findIndex((w) => w.status === 'passing');
      const lastNeedsIdx = weaknesses.map((w) => w.status).lastIndexOf('needs_work');
      expect(lastNeedsIdx).toBeLessThan(firstPassingIdx);
    }
  });
});
