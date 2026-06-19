import { describe, expect, it } from 'vitest';
import {
  buildStructureStatus,
  mergeSameCompanyWorkHistory,
  normalizeWorkHistory,
  resolveWorkHistory,
} from '@/lib/extension/structured-profile';

const RESUME = `SHASHANK SINGH
Senior Performance Engineer
Bangalore, India | +91 9876543210 | test@email.com

EXPERIENCE
Acme Corp | Senior Engineer
Jan 2020 - Present
- Built load testing platform

EDUCATION
IIT Delhi
B.Tech Computer Science | 2018
`;

describe('structured-profile', () => {
  it('buildStructureStatus: empty when no jobs', () => {
    const s = buildStructureStatus({
      structure_extracted_at: '2026-01-01T00:00:00Z',
      structured_work_history: [],
    });
    expect(s.readiness).toBe('empty');
    expect(s.work_count).toBe(0);
  });

  it('buildStructureStatus: review when extracted but not reviewed', () => {
    const s = buildStructureStatus({
      structure_extracted_at: '2026-01-01T00:00:00Z',
      structured_work_history: [{ company: 'Acme', title: 'Engineer' }],
    });
    expect(s.readiness).toBe('review');
    expect(s.work_count).toBe(1);
  });

  it('buildStructureStatus: ready when reviewed with jobs', () => {
    const s = buildStructureStatus({
      structure_extracted_at: '2026-01-01T00:00:00Z',
      structure_reviewed_at: '2026-01-02T00:00:00Z',
      structured_work_history: [{ company: 'Acme', title: 'Engineer' }],
    });
    expect(s.readiness).toBe('ready');
  });

  it('resolveWorkHistory prefers structured rows after extraction', () => {
    const work = resolveWorkHistory(
      {
        structure_extracted_at: '2026-01-01T00:00:00Z',
        structured_work_history: [{ company: 'StructuredCo', title: 'Lead' }],
      },
      RESUME,
    );
    expect(work[0]?.company).toBe('StructuredCo');
  });

  it('resolveWorkHistory returns empty without AI extraction', () => {
    const work = resolveWorkHistory(null, RESUME);
    expect(work).toHaveLength(0);
  });

  it('resolveWorkHistory ignores legacy regex source', () => {
    const work = resolveWorkHistory(
      {
        structure_extracted_at: '2026-01-01T00:00:00Z',
        structure_source: 'regex',
        structured_work_history: [{ company: 'Acme', title: 'Software Engineer' }],
      },
      RESUME,
    );
    expect(work).toHaveLength(0);
  });

  it('resolveWorkHistory uses AI structured rows', () => {
    const work = resolveWorkHistory(
      {
        structure_extracted_at: '2026-01-01T00:00:00Z',
        structure_source: 'ai',
        structured_work_history: [{ company: 'IRIS Software', title: 'Senior Performance Engineer' }],
      },
      RESUME,
    );
    expect(work).toHaveLength(1);
    expect(work[0]?.company).toMatch(/IRIS/i);
  });

  it('normalizeWorkHistory drops invalid rows', () => {
    const work = normalizeWorkHistory([
      { company: 'Ok Corp', title: 'Software Engineer' },
      { company: '', title: '' },
      null,
    ]);
    expect(work).toHaveLength(1);
    expect(work[0]?.company).toBe('Ok Corp');
  });

  it('mergeSameCompanyWorkHistory combines multiple client projects at one employer', () => {
    const merged = mergeSameCompanyWorkHistory([
      {
        company: 'IRIS Software, Noida',
        title: 'Senior Performance Engineer',
        start: 'Sep 2024',
        end: 'Present',
        summary: 'Client: Charles Schwab. Load testing migration.',
      },
      {
        company: 'Coforge Ltd, Noida',
        title: 'Performance Test Analyst',
        start: 'Aug 2023',
        end: 'Sep 2024',
        summary: 'Client: Tokio Marine. JMeter scripts.',
      },
      {
        company: 'Cognizant Technology Solutions, Bangalore/Pune',
        title: 'Performance Tester',
        start: 'Sep 2020',
        end: 'Dec 2021',
        summary: 'Client: Family Dollar Stores. Load tests for retail platform.',
      },
      {
        company: 'Cognizant Technology Solutions, Bangalore',
        title: 'Performance Tester',
        start: 'Oct 2018',
        end: 'Aug 2020',
        summary: 'Client: Warner Bros. HP LoadRunner scripts.',
      },
    ]);
    expect(merged).toHaveLength(3);
    expect(merged.map((j) => j.company)).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/IRIS/i),
        expect.stringMatching(/Coforge/i),
        expect.stringMatching(/Cognizant/i),
      ]),
    );
    const cognizant = merged.find((j) => /cognizant/i.test(j.company || ''));
    expect(cognizant?.start).toMatch(/Oct 2018/i);
    expect(cognizant?.end).toMatch(/Dec 2021/i);
    expect(cognizant?.summary).toMatch(/Family Dollar/i);
    expect(cognizant?.summary).toMatch(/Warner Bros/i);
  });
});
