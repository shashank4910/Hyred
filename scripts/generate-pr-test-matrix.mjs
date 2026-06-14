#!/usr/bin/env node
/**
 * Generates docs/testing/pr-test-matrix.md and tests/pr-coverage.json
 * — one test case per merged PR. Re-run after new merges:
 *   node scripts/generate-pr-test-matrix.mjs
 */
import { execSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function fetchPrs() {
  const raw = execSync(
    'gh pr list --state merged --limit 200 --json number,title,mergedAt',
    { cwd: root, encoding: 'utf8' },
  );
  return JSON.parse(raw).sort((a, b) => a.number - b.number);
}

/** Hand-curated overrides for critical PRs; heuristics fill the rest. */
const OVERRIDES = {
  1: {
    testCase: 'New user completes sign-up, uploads resume, sees dashboard with matches and stats.',
    type: 'e2e',
    automatedIn: 'tests/e2e/auth-dashboard.spec.ts',
    testName: 'PR-001 production-grade onboarding smoke',
  },
  32: {
    testCase: 'Authenticated user clicks Run Scan; POST /api/ingest returns 200 (not 401).',
    type: 'e2e',
    automatedIn: 'tests/e2e/scan.spec.ts',
    testName: 'PR-032 run scan authenticated',
  },
  54: {
    testCase: 'User A cannot see User B matches; API routes return only own profile_id data.',
    type: 'e2e',
    automatedIn: 'tests/e2e/auth-dashboard.spec.ts',
    testName: 'PR-054 per-user data isolation',
  },
  91: {
    testCase: 'readableError({ error: { message: "fail" } }) never returns "[object Object]".',
    type: 'unit',
    automatedIn: 'tests/unit/ui-errors.test.ts',
    testName: 'PR-091 readableError object',
  },
  97: {
    testCase: 'Concurrent profile upsert on sign-up does not throw duplicate key error.',
    type: 'unit',
    automatedIn: 'tests/e2e/auth-dashboard.spec.ts',
    testName: 'PR-097 signup no duplicate profile crash',
  },
  96: {
    testCase: 'Toasts render bottom-right; logout dismisses all toasts including scan notice.',
    type: 'e2e',
    automatedIn: 'tests/e2e/toasts.spec.ts',
    testName: 'PR-096 toast placement and logout cleanup',
  },
  105: {
    testCase: 'Click Run Scan → scan-started toast appears immediately with browse links.',
    type: 'e2e',
    automatedIn: 'tests/e2e/scan.spec.ts',
    testName: 'PR-105 scan started toast',
  },
  106: {
    testCase: 'Dashboard status bar shows all 7 tabs on one row without horizontal scrollbar.',
    type: 'e2e',
    automatedIn: 'tests/e2e/dashboard-ui.spec.ts',
    testName: 'PR-106 status filter no scroll',
  },
  109: {
    testCase: 'POST /api/ingest/cancel returns 404 when no scan running; 401 when logged out.',
    type: 'api',
    automatedIn: 'tests/e2e/scan.spec.ts',
    testName: 'PR-109 cancel scan API',
  },
  112: {
    testCase: 'stripHtml removes script/style tags and decodes entities from JD HTML.',
    type: 'unit',
    automatedIn: 'tests/unit/jd-fetcher.test.ts',
    testName: 'PR-112 stripHtml sanitization',
  },
  116: {
    testCase: 'scoreJob input JD with HTML tags does not inflate score from markup noise.',
    type: 'unit',
    automatedIn: 'tests/unit/jd-fetcher.test.ts',
    testName: 'PR-116 stripHtml before scoring',
  },
  33: {
    testCase: 'Jobs posted >45 days ago excluded from dashboard query (posted_at filter).',
    type: 'unit',
    automatedIn: 'tests/unit/match-stats.test.ts',
    testName: 'PR-033 stale job cutoff 45 days',
  },
  87: {
    testCase: 'Non-admin user does not see job source badges or source filter on dashboard.',
    type: 'e2e',
    automatedIn: 'tests/e2e/admin-privacy.spec.ts',
    testName: 'PR-087 hide sources from non-admin',
  },
  95: {
    testCase: '/privacy and /terms load; sign-up shows Terms/Privacy consent checkbox.',
    type: 'e2e',
    automatedIn: 'tests/e2e/public-pages.spec.ts',
    testName: 'PR-095 legal pages and signup consent',
  },
  99: {
    testCase: 'Logged-in app shell has no Privacy/Terms footer links; onboarding has no AI consent checkbox.',
    type: 'e2e',
    automatedIn: 'tests/e2e/public-pages.spec.ts',
    testName: 'PR-099 no post-login legal friction',
  },
};

function inferTestCase(pr) {
  const n = pr.number;
  if (OVERRIDES[n]) return OVERRIDES[n];

  const t = pr.title.toLowerCase();
  const id = String(n).padStart(3, '0');

  if (t.startsWith('docs') || t.includes('docs(context)') || t.includes('docs:')) {
    return {
      testCase: `Verify documentation updated as described in PR #${n} title (manual review).`,
      type: 'manual',
      automatedIn: null,
      testName: `PR-${id} docs review`,
    };
  }
  if (t.includes('chore') && !t.includes('fix')) {
    return {
      testCase: `Confirm chore change from PR #${n} does not break build or typecheck.`,
      type: 'ci',
      automatedIn: '.github/workflows/test.yml',
      testName: `PR-${id} build passes`,
    };
  }
  if (t.includes('fix(ui)') || t.includes('fix(ui') || t.includes('feat(ui)')) {
    return {
      testCase: `Visual/regression: UI change in PR #${n} renders without overlap or broken layout.`,
      type: 'e2e',
      automatedIn: 'tests/e2e/dashboard-ui.spec.ts',
      testName: `PR-${id} UI regression`,
    };
  }
  if (t.includes('fix(pdf)') || t.includes('ats-resume') || t.includes('feat(ats')) {
    return {
      testCase: `Generate ATS PDF on job detail; verify header, keywords, and download filename per PR #${n}.`,
      type: 'e2e',
      automatedIn: 'tests/e2e/job-detail.spec.ts',
      testName: `PR-${id} ATS PDF`,
    };
  }
  if (t.includes('fix(auth)') || t.includes('feat(auth)')) {
    return {
      testCase: `Auth flow from PR #${n}: sign-up/sign-in succeeds without server error.`,
      type: 'e2e',
      automatedIn: 'tests/e2e/auth-dashboard.spec.ts',
      testName: `PR-${id} auth`,
    };
  }
  if (t.includes('ingest') || t.includes('scan')) {
    return {
      testCase: `Run Scan / ingest behavior from PR #${n} completes or fails with readable message.`,
      type: 'e2e',
      automatedIn: 'tests/e2e/scan.spec.ts',
      testName: `PR-${id} ingest`,
    };
  }
  if (t.includes('stats')) {
    return {
      testCase: `Stats page counts match dashboard filters (user-scoped) per PR #${n}.`,
      type: 'e2e',
      automatedIn: 'tests/e2e/stats.spec.ts',
      testName: `PR-${id} stats`,
    };
  }
  if (t.includes('admin')) {
    return {
      testCase: `Admin-only feature from PR #${n} blocked for regular users (403/redirect).`,
      type: 'e2e',
      automatedIn: 'tests/e2e/admin-privacy.spec.ts',
      testName: `PR-${id} admin gate`,
    };
  }
  if (t.includes('perf(')) {
    return {
      testCase: `Ingest completes within Vercel timeout; scan does not re-score unchanged jobs unnecessarily.`,
      type: 'integration',
      automatedIn: null,
      testName: `PR-${id} perf (staging nightly)`,
    };
  }
  if (t.includes('skill-match') || t.includes('scoring')) {
    return {
      testCase: `Skill match / scoreJob output includes JD keywords and respects resume content.`,
      type: 'unit',
      automatedIn: 'tests/unit/scoring.test.ts',
      testName: `PR-${id} scoring`,
    };
  }
  if (t.includes('linkedin') || t.includes('sources') || t.includes('jsearch')) {
    return {
      testCase: `Ingest from source in PR #${n} returns normalized jobs (mocked in unit tests).`,
      type: 'unit',
      automatedIn: 'tests/unit/sources.test.ts',
      testName: `PR-${id} source`,
    };
  }
  if (t.includes('bookmark') || t.includes('matches')) {
    return {
      testCase: `Match list interactions from PR #${n} work on dashboard (sort, bookmark, status).`,
      type: 'e2e',
      automatedIn: 'tests/e2e/dashboard-ui.spec.ts',
      testName: `PR-${id} matches`,
    };
  }
  if (t.includes('browser_agent')) {
    return {
      testCase: `Auto-apply agent health check on Render (manual/staging).`,
      type: 'manual',
      automatedIn: null,
      testName: `PR-${id} browser agent staging`,
    };
  }

  return {
    testCase: `Verify feature/fix described in PR #${n}: "${pr.title}".`,
    type: 'manual',
    automatedIn: null,
    testName: `PR-${id} manual verify`,
  };
}

function buildCoverage(prs) {
  const coverage = { version: 1, generatedAt: new Date().toISOString(), prs: {} };
  for (const pr of prs) {
    const inferred = inferTestCase(pr);
    const testId = `TC-${String(pr.number).padStart(3, '0')}`;
    coverage.prs[String(pr.number)] = {
      number: pr.number,
      title: pr.title,
      mergedAt: pr.mergedAt,
      testId,
      ...inferred,
    };
  }
  return coverage;
}

function buildMarkdown(coverage) {
  const rows = Object.values(coverage.prs).sort((a, b) => a.number - b.number);
  const automated = rows.filter((r) => r.automatedIn && r.type !== 'manual' && r.type !== 'ci');
  const lines = [
    '# PR Test Matrix — Hyred',
    '',
    '> **One test case per merged PR.** Generated by `node scripts/generate-pr-test-matrix.mjs`.',
    '> Re-run after merging new PRs, then add/implement tests in the files listed under **Automated in**.',
    '',
    `**Total PRs:** ${rows.length} · **With automation target:** ${automated.length} · **Generated:** ${coverage.generatedAt}`,
    '',
    '## How to use',
    '',
    '1. Find your PR number below.',
    '2. Run the automated test: `npm run test` (unit) or `npm run test:e2e` (browser).',
    '3. Manual/ci rows: follow the test case steps or rely on CI build.',
    '',
    '## Matrix',
    '',
    '| PR | Title | Test ID | Type | Test case | Automated in |',
    '|----|-------|---------|------|-----------|--------------|',
  ];

  for (const r of rows) {
    const auto = r.automatedIn ? `\`${r.automatedIn}\`` : '—';
    const title = r.title.replace(/\|/g, '\\|').slice(0, 60);
    const tc = r.testCase.replace(/\|/g, '\\|').slice(0, 80);
    lines.push(`| ${r.number} | ${title} | ${r.testId} | ${r.type} | ${tc} | ${auto} |`);
  }

  lines.push('', '## Run all tests', '', '```bash', 'npm run test:ci', '```', '');
  return lines.join('\n');
}

const prs = fetchPrs();
const coverage = buildCoverage(prs);
mkdirSync(join(root, 'docs/testing'), { recursive: true });
mkdirSync(join(root, 'tests/meta'), { recursive: true });
writeFileSync(join(root, 'tests/pr-coverage.json'), JSON.stringify(coverage, null, 2));
writeFileSync(join(root, 'docs/testing/pr-test-matrix.md'), buildMarkdown(coverage));
console.log(`Generated ${prs.length} PR test cases → docs/testing/pr-test-matrix.md`);
