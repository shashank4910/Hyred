/**
 * Layer C — consistency gate for ATS report checks.
 * Drops ungrounded evidence and forbids contradictory pass states.
 */

import type { AtsReportCheck, AtsReportCheckStatus } from './ats-report';
import { resumeContainsEvidence } from './ats-resume-parse';

/** Checks that may fail/warn without quotes (absence of a field/section). */
const ABSENCE_OK_IDS = new Set([
  'fact-contact',
  'fact-sections',
  'fact-bullets',
  'fact-length',
  'fact-file',
  'fact-parse',
  'fact-format',
  'fact-dates',
  // Skills/JD/sections may fail on absence without a quote
  'semantic-skills',
  'semantic-jd',
  'semantic-sections',
]);

function issueCountFromFoundItems(check: AtsReportCheck): number {
  return (check.foundItems ?? []).filter((f) => !f.ok).length;
}

function summarize(status: AtsReportCheckStatus, n: number): string {
  if (status === 'locked') return 'Locked';
  if (status === 'pass') return 'No issues';
  if (n <= 0) return status === 'warn' ? '1 issue' : 'Needs work';
  return `${n} issue${n === 1 ? '' : 's'}`;
}

/**
 * Ground quotes/suggestions to resume text; fix pass vs missing foundItems;
 * drop fail/warn claims that have neither grounded evidence nor allowed absence.
 */
export function gateAtsChecks(
  checks: AtsReportCheck[],
  resumeText: string,
): AtsReportCheck[] {
  const out: AtsReportCheck[] = [];

  for (const raw of checks) {
    const check: AtsReportCheck = { ...raw };

    // Ground quotes
    if (check.quotes?.length) {
      const grounded = check.quotes.filter((q) =>
        resumeContainsEvidence(resumeText, q.text),
      );
      check.quotes = grounded;
    }

    // Ground spelling suggestions — keep only if `found` appears in resume
    if (check.suggestions?.length) {
      check.suggestions = check.suggestions.filter((s) =>
        resumeContainsEvidence(resumeText, s.found),
      );
    }

    // Ground repetitions — word must appear in resume
    if (check.repetitions?.length) {
      check.repetitions = check.repetitions.filter((r) =>
        resumeContainsEvidence(resumeText, r.word),
      );
    }

    // Contradiction: any failed foundItem ⇒ cannot be pass
    const failedItems = (check.foundItems ?? []).filter((f) => !f.ok);
    if (failedItems.length > 0 && check.status === 'pass') {
      check.status = 'warn';
      check.summary = summarize('warn', failedItems.length);
      if (!check.detail || /no issues|complete|looking good/i.test(check.detail)) {
        check.detail = `Missing: ${failedItems.map((f) => f.label).join(', ')}.`;
      }
    }

    // Pass with leftover fail evidence → strip fail-looking evidence on true pass
    if (check.status === 'pass') {
      check.quotes = [];
      check.suggestions = [];
      check.repetitions = [];
      check.summary = 'No issues';
    }

    // Fail/warn must have evidence OR allowed absence OR failed foundItems
    if (check.status === 'fail' || check.status === 'warn') {
      const hasQuotes = (check.quotes?.length ?? 0) > 0;
      const hasSuggestions = (check.suggestions?.length ?? 0) > 0;
      const hasReps = (check.repetitions?.length ?? 0) > 0;
      const hasFailedItems = failedItems.length > 0;
      const absenceOk = ABSENCE_OK_IDS.has(check.id);

      if (!hasQuotes && !hasSuggestions && !hasReps && !hasFailedItems && !absenceOk) {
        // Ungrounded semantic claim — drop entirely
        continue;
      }

      const n =
        failedItems.length ||
        (check.quotes?.length ?? 0) ||
        (check.suggestions?.length ?? 0) ||
        (check.repetitions?.length ?? 0) ||
        issueCountFromFoundItems(check) ||
        1;
      check.summary = summarize(check.status, n);
    }

    out.push(check);
  }

  return out;
}
