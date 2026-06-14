import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('PR test matrix completeness', () => {
  const coveragePath = join(process.cwd(), 'tests/pr-coverage.json');
  const coverage = JSON.parse(readFileSync(coveragePath, 'utf8')) as {
    prs: Record<
      string,
      { number: number; title: string; testId: string; testCase: string; type: string }
    >;
  };

  it('every merged PR has exactly one test case entry', () => {
    const entries = Object.values(coverage.prs);
    expect(entries.length).toBeGreaterThanOrEqual(100);
    const numbers = entries.map((e) => e.number).sort((a, b) => a - b);
    for (let i = 1; i < numbers.length; i++) {
      expect(numbers[i]).toBeGreaterThan(numbers[i - 1]);
    }
  });

  it('each PR entry has required fields', () => {
    for (const entry of Object.values(coverage.prs)) {
      expect(entry.testId).toMatch(/^TC-\d{3}$/);
      expect(entry.testCase.length).toBeGreaterThan(10);
      expect(entry.type).toBeTruthy();
      expect(entry.title).toBeTruthy();
    }
  });
});
