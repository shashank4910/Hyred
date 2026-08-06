import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import { gateAtsChecks } from '@/lib/ats-consistency';
import { buildFactChecks } from '@/lib/ats-fact-checks';
import {
  assembleEvidenceReport,
  runEvidenceGroundedAts,
  runStructuralAts,
} from '@/lib/ats-evidence-engine';
import { checkAtsCompatibility } from '@/lib/ats-checker';
import {
  normalizeResumeText,
  parseResumeStructure,
  resumeContainsEvidence,
} from '@/lib/ats-resume-parse';
import type { AtsReportCheck } from '@/lib/ats-report';

const fixture = (name: string) =>
  readFileSync(join(process.cwd(), 'tests/fixtures/ats-resumes', name), 'utf8');

function byId(checks: AtsReportCheck[], id: string) {
  return checks.find((c) => c.id === id);
}

describe('ats-resume-parse', () => {
  it('normalizes PDF ligatures so grounding works', () => {
    const raw = 'diﬀerent domains and Proﬁciency';
    const n = normalizeResumeText(raw);
    expect(n).toContain('different');
    expect(n).toContain('Proficiency');
  });

  it('accepts MM/YYYY as month-bearing dates (Akansha)', () => {
    const parsed = parseResumeStructure(fixture('akansha-original.txt'));
    expect(parsed.hasMonthInDates).toBe(true);
    expect(parsed.contact.email).toContain('akanshatomar');
    expect(parsed.contact.linkedin).toBeUndefined();
    expect(parsed.bulletCount).toBe(0);
    expect(parsed.sections.find((s) => s.label === 'Skills')?.found).toBe(true);
  });

  it('recognizes EDUCATIONAL QUALIFICATION as Education', () => {
    const text = [
      'Jane Doe',
      'jane@example.com',
      '+1 555 0100',
      'Profile',
      'QA engineer.',
      'Technical Skills',
      'Selenium, JIRA',
      'Experience Summary',
      'Acme — QA Lead',
      'Lead QA project for CRM migration.',
      'Training of new Resources on Domain.',
      'EDUCATIONAL QUALIFICATION',
      'B.Tech, E&C - 2013 Batch.',
    ].join('\n');
    const parsed = parseResumeStructure(text);
    expect(parsed.sections.find((s) => s.label === 'Education')?.found).toBe(true);
  });

  it('token-matches odd headings without synonym patches (Ankit-style)', () => {
    const text = [
      'Area of expertise',
      '1. SpringBoot APIs',
      'PROFFESSINAL SUMMARY',
      'Senior analyst with 5 years in telecom.',
      'Accenture Experience',
      'Designed Restful APIs for project modules.',
      'TCS EXPERINECE',
      'Enhanced UI with Angular 6.',
    ].join('\n');
    const parsed = parseResumeStructure(text);
    expect(parsed.sections.find((s) => s.label === 'Experience')?.found).toBe(true);
    expect(parsed.sections.find((s) => s.label === 'Skills')?.found).toBe(true);
    expect(parsed.sections.find((s) => s.label === 'Summary')?.found).toBe(true);
    expect(parsed.sections.find((s) => s.label === 'Education')?.found).toBe(false);
  });

  it('LLM section map overrides fact-sections when headings are grounded', () => {
    const text = [
      'Area of expertise',
      'Spring Boot, Angular',
      'PROFFESSINAL SUMMARY',
      'Senior analyst.',
      'Accenture Experience',
      'Built APIs.',
      'TCS EXPERINECE',
      'UI work.',
    ].join('\n');
    const legacy = checkAtsCompatibility(text);
    const facts = buildFactChecks(parseResumeStructure(text), legacy);
    const semantic: AtsReportCheck[] = [
      {
        id: 'semantic-sections',
        label: 'Essential Sections',
        status: 'fail',
        summary: '1 issue',
        detail: 'Missing Education',
        foundItems: [
          { label: 'Experience', ok: true, value: 'Accenture Experience' },
          { label: 'Education', ok: false },
          { label: 'Skills', ok: true, value: 'Area of expertise' },
          { label: 'Summary', ok: true, value: 'PROFFESSINAL SUMMARY' },
        ],
        quotes: [
          { text: 'Accenture Experience' },
          { text: 'Area of expertise' },
          { text: 'PROFFESSINAL SUMMARY' },
        ],
      },
    ];
    // Simulate grounded semantic-sections via gate path used by assemble
    const gated = gateAtsChecks([...facts, ...semantic], text);
    const report = assembleEvidenceReport(gated, legacy, text, { isPremium: false });
    const sections = report.categories.find((c) => c.id === 'sections')?.checks ?? [];
    const essential = sections.find(
      (c) => c.id === 'semantic-sections' || c.id === 'fact-sections',
    );
    expect(essential?.id).toBe('semantic-sections');
    expect(essential?.foundItems?.find((f) => f.label === 'Experience')?.ok).toBe(true);
    expect(essential?.foundItems?.find((f) => f.label === 'Skills')?.ok).toBe(true);
    expect(essential?.foundItems?.find((f) => f.label === 'Education')?.ok).toBe(false);
  });

  it('resumeContainsEvidence matches across whitespace', () => {
    const hay = 'Involved in Functional Testing,\nRegression';
    expect(resumeContainsEvidence(hay, 'Involved in Functional Testing, Regression')).toBe(
      true,
    );
    expect(resumeContainsEvidence(hay, 'totally invented claim')).toBe(false);
  });
});

describe('ats-fact-checks + consistency gate', () => {
  it('warns LinkedIn missing and never marks contact as pass', () => {
    const text = fixture('akansha-original.txt');
    const legacy = checkAtsCompatibility(text, 'akashnka original.pdf');
    const parsed = parseResumeStructure(text);
    const facts = buildFactChecks(parsed, legacy);
    const contact = byId(facts, 'fact-contact')!;
    expect(contact.status).not.toBe('pass');
    expect(contact.foundItems?.some((f) => f.label === 'LinkedIn profile' && !f.ok)).toBe(
      true,
    );

    // Force a contradictory pass — gate must demote
    const gated = gateAtsChecks(
      [{ ...contact, status: 'pass', summary: 'No issues' }],
      parsed.text,
    );
    expect(gated[0].status).toBe('warn');
    expect(gated[0].summary).not.toMatch(/no issues/i);
  });

  it('passes dates when MM/YYYY is present (no false year-only warn)', () => {
    const text = fixture('akansha-original.txt');
    const legacy = checkAtsCompatibility(text, 'a.pdf');
    const facts = buildFactChecks(parseResumeStructure(text), legacy);
    const dates = byId(facts, 'fact-dates')!;
    expect(dates.status).toBe('pass');
    expect(dates.detail.toLowerCase()).not.toContain('only years');
  });

  it('drops ungrounded fail claims', () => {
    const text = fixture('clean-strong.txt');
    const fake: AtsReportCheck = {
      id: 'semantic-spelling',
      label: 'Spelling',
      status: 'fail',
      summary: '1 issue',
      detail: 'Invented typo',
      quotes: [{ text: 'this-string-is-not-in-the-resume-xyz' }],
    };
    const gated = gateAtsChecks([fake], text);
    expect(gated.find((c) => c.id === 'semantic-spelling')).toBeUndefined();
  });
});

describe('evidence-grounded engine', () => {
  it('structural path returns gated report with fact checks', () => {
    const out = runStructuralAts(fixture('clean-strong.txt'), {
      filename: 'priya.pdf',
    });
    expect(out.engine).toBe('structural');
    expect(out.report.categories.some((c) => c.id === 'content')).toBe(true);
    const contact = out.report.categories
      .flatMap((c) => c.checks)
      .find((c) => c.id === 'fact-contact');
    expect(contact?.status).toBe('pass');
    expect(contact?.foundItems?.find((f) => f.label === 'LinkedIn profile')?.ok).toBe(true);
  });

  it('hybrid with injected semantic matches Akansha expectations', async () => {
    const text = fixture('akansha-original.txt');
    const semantic: AtsReportCheck[] = [
      {
        id: 'semantic-spelling',
        label: 'Spelling & Grammar',
        status: 'fail',
        summary: '3 issues',
        detail: 'Misspellings found in skills and duties.',
        suggestions: [
          { found: 'Regresion', suggestion: 'Regression' },
          { found: 'methodlogy', suggestion: 'methodology' },
          { found: 'Backened', suggestion: 'Backend' },
        ],
        quotes: [{ text: 'Involved in Backened Testing.' }],
      },
      {
        id: 'semantic-skills',
        label: 'Skills Optimization',
        status: 'pass',
        summary: 'No issues',
        detail: 'Skills include JIRA, Postman, SQL, Soap UI, Splunk.',
        foundItems: [
          { label: 'JIRA', ok: true },
          { label: 'Postman', ok: true },
          { label: 'Sql', ok: true },
          { label: 'Soap UI', ok: true },
          { label: 'Splunk', ok: true },
          { label: 'ALM', ok: true },
          { label: 'Manual Testing', ok: true },
        ],
      },
      {
        id: 'semantic-impact',
        label: 'Quantifying Impact',
        status: 'fail',
        summary: '3 issues',
        detail: 'Experience lines lack metrics.',
        quotes: [
          { text: 'Involved in writing test cases and executing test cases.' },
          { text: 'Involved in functional testing of product.' },
        ],
      },
      {
        id: 'semantic-repetition',
        label: 'Repetition',
        status: 'fail',
        summary: '1 issue',
        detail: 'Overuses “involved”.',
        repetitions: [
          { word: 'involved', count: 12, suggestions: ['executed', 'validated', 'owned'] },
        ],
      },
      {
        id: 'semantic-template',
        label: 'Template Junk',
        status: 'fail',
        summary: '1 issue',
        detail: 'Leftover template labels.',
        quotes: [{ text: 'Achievements/Tasks' }],
      },
      {
        id: 'semantic-truncated',
        label: 'Truncated Lines',
        status: 'fail',
        summary: '1 issue',
        detail: 'Job title appears cut off.',
        quotes: [{ text: 'Associate Quality Anal' }],
      },
    ];

    const out = await runEvidenceGroundedAts(text, {
      mode: 'hybrid',
      filename: 'akashnka original.pdf',
      semanticChecks: semantic,
    });

    expect(out.engine).toBe('hybrid');
    const checks = out.report.categories.flatMap((c) => c.checks);
    expect(byId(checks, 'semantic-spelling')?.status).toBe('fail');
    expect(byId(checks, 'semantic-skills')?.status).toBe('pass');
    expect(byId(checks, 'semantic-impact')?.status).toBe('fail');
    expect(byId(checks, 'fact-dates')?.status).toBe('pass');
    expect(byId(checks, 'fact-contact')?.status).toBe('warn');

    // Every fail/warn on fact/semantic checks must have grounded evidence or failed foundItems
    for (const c of checks) {
      if (!c.id.startsWith('fact-') && !c.id.startsWith('semantic-')) continue;
      if (c.status !== 'fail' && c.status !== 'warn') continue;
      const has =
        (c.quotes?.length ?? 0) > 0 ||
        (c.suggestions?.length ?? 0) > 0 ||
        (c.repetitions?.length ?? 0) > 0 ||
        (c.foundItems ?? []).some((f) => !f.ok) ||
        c.id.startsWith('fact-') ||
        c.id === 'semantic-skills' ||
        c.id === 'semantic-jd';
      expect(has).toBe(true);
    }
  });

  it('assembleEvidenceReport computes issue counts from gated checks', () => {
    const text = fixture('clean-strong.txt');
    const legacy = checkAtsCompatibility(text);
    const facts = buildFactChecks(parseResumeStructure(text), legacy);
    const gated = gateAtsChecks(facts, text);
    const report = assembleEvidenceReport(gated, legacy, text, { isPremium: false });
    expect(report.parseRatePercent).toBeGreaterThan(50);
    expect(report.categories.find((c) => c.id === 'content')).toBeTruthy();
  });

  it('dedupes Vague when it re-quotes the same Impact duty lines', () => {
    const text = [
      'Priya Sharma',
      'priya@example.com',
      '+91 98765 43210',
      'linkedin.com/in/priya',
      'Summary',
      'QA engineer.',
      'Skills',
      'JIRA, Selenium',
      'Experience',
      'Acme — Senior QA',
      'Test Estimations , Requirement clarification.',
      'Defect management at Rally.',
      'Education',
      'B.Tech 2018',
    ].join('\n');
    const legacy = checkAtsCompatibility(text);
    const facts = buildFactChecks(parseResumeStructure(text), legacy);
    const semantic: AtsReportCheck[] = [
      {
        id: 'semantic-impact',
        label: 'Quantifying Impact',
        status: 'fail',
        summary: '2 issues',
        detail: 'No metrics.',
        quotes: [
          { text: 'Test Estimations , Requirement clarification.' },
          { text: 'Defect management at Rally.' },
        ],
      },
      {
        id: 'semantic-vague',
        label: 'Vague Phrases',
        status: 'fail',
        summary: '2 issues',
        detail: 'Vague duties.',
        quotes: [
          { text: 'Test Estimations , Requirement clarification.' },
          { text: 'Defect management at Rally.' },
        ],
      },
    ];
    const gated = gateAtsChecks([...facts, ...semantic], text);
    const report = assembleEvidenceReport(gated, legacy, text, { isPremium: true });
    const checks = report.categories.flatMap((c) => c.checks);
    expect(byId(checks, 'semantic-impact')?.status).toBe('fail');
    expect(byId(checks, 'semantic-vague')).toBeUndefined();
  });

  it('dedupes overlapping Involved-in content cards and aligns Skill Evidence', () => {
    const text = fixture('akansha-original.txt');
    const semantic: AtsReportCheck[] = [
      {
        id: 'semantic-skills',
        label: 'Skills Optimization',
        status: 'pass',
        summary: 'No issues',
        detail: 'Skills include JIRA, Postman, SQL.',
        foundItems: [
          { label: 'JIRA', ok: true },
          { label: 'Postman', ok: true },
          { label: 'SQL', ok: true },
        ],
      },
      {
        id: 'semantic-impact',
        label: 'Quantifying Impact',
        status: 'fail',
        summary: '2 issues',
        detail: 'Lines lack metrics.',
        quotes: [{ text: 'Involved in writing test cases and executing test cases.' }],
      },
      {
        id: 'semantic-repetition',
        label: 'Repetition',
        status: 'fail',
        summary: '1 issue',
        detail: 'Overuses involved.',
        repetitions: [
          { word: 'involved', count: 11, suggestions: ['executed', 'validated'] },
        ],
      },
      {
        id: 'semantic-vague',
        label: 'Vague Phrases',
        status: 'fail',
        summary: '1 issue',
        detail: 'Vague duty filler.',
        quotes: [{ text: 'Involved in functional testing of product.' }],
      },
      {
        id: 'semantic-verbs',
        label: 'Action Verbs',
        status: 'fail',
        summary: '1 issue',
        detail: 'Weak openings with involved.',
        quotes: [{ text: 'Involved in Backened Testing.' }],
      },
    ];

    const legacy = checkAtsCompatibility(text, 'akashnka original.pdf');
    const parsed = parseResumeStructure(text);
    const facts = buildFactChecks(parsed, legacy);
    const gated = gateAtsChecks([...facts, ...semantic], parsed.text);
    const report = assembleEvidenceReport(gated, legacy, parsed.text, {
      isPremium: true,
    });
    const checks = report.categories.flatMap((c) => c.checks);

    expect(byId(checks, 'semantic-repetition')?.status).toBe('fail');
    expect(byId(checks, 'semantic-impact')?.status).toBe('fail');
    expect(byId(checks, 'semantic-vague')).toBeUndefined();
    expect(byId(checks, 'semantic-verbs')).toBeUndefined();

    const skillEvidence = byId(checks, 'sen-skill-evidence');
    expect(skillEvidence?.status).toBe('pass');
    expect(skillEvidence?.detail.toLowerCase()).toMatch(/jira|postman|sql/);

    const credibility = byId(checks, 'hr-credibility');
    expect(credibility?.status).not.toBe('pass');

    const hardSkills = byId(checks, 'tailor-hard');
    expect(hardSkills?.emptyHint).toMatch(/job description/i);
  });
});
