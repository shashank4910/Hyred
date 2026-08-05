/**
 * Layer A — deterministic ATS fact checks from structured parse.
 * No spelling / skill / vague-language dictionaries.
 */

import type { AtsCheckResult, FileHints } from './ats-checker';
import type { AtsReportCheck, AtsReportFoundItem } from './ats-report';
import type { ParsedResume } from './ats-resume-parse';

function statusSummary(
  status: AtsReportCheck['status'],
  issueCount = 0,
): string {
  if (status === 'locked') return 'Locked';
  if (status === 'pass') return 'No issues';
  if (issueCount <= 0) return status === 'warn' ? '1 issue' : 'Needs work';
  return `${issueCount} issue${issueCount === 1 ? '' : 's'}`;
}

function contactItems(parsed: ParsedResume): AtsReportFoundItem[] {
  const c = parsed.contact;
  const items: AtsReportFoundItem[] = [
    { label: 'Email address', value: c.email, ok: Boolean(c.email) },
    { label: 'Phone number', value: c.phone, ok: Boolean(c.phone) },
    { label: 'LinkedIn profile', value: c.linkedin, ok: Boolean(c.linkedin) },
    { label: 'Location', value: c.location, ok: Boolean(c.location) },
  ];
  if (c.github) items.push({ label: 'GitHub profile', value: c.github, ok: true });
  return items;
}

function sectionItems(parsed: ParsedResume): AtsReportFoundItem[] {
  return parsed.sections
    .filter((s) => s.required || s.found || s.label === 'Summary')
    .map((s) => ({ label: s.label, ok: s.found }));
}

/**
 * Build Layer A checks from parse + legacy AtsCheckResult (for parseQuality / fileHints / length).
 */
export function buildFactChecks(
  parsed: ParsedResume,
  result: AtsCheckResult,
): AtsReportCheck[] {
  const checks: AtsReportCheck[] = [];
  const parsePct =
    result.parseQuality === 'good'
      ? 90 + Math.min(9, Math.floor(result.overallScore / 12))
      : result.parseQuality === 'degraded'
        ? 55 + Math.floor(result.overallScore / 5)
        : 25;

  const parseStatus: AtsReportCheck['status'] =
    result.parseQuality === 'good'
      ? 'pass'
      : result.parseQuality === 'degraded'
        ? 'warn'
        : 'fail';

  checks.push({
    id: 'fact-parse',
    criterionKey: 'parse',
    label: 'ATS Parse Rate',
    score: parsePct,
    status: parseStatus,
    summary: statusSummary(parseStatus),
    education:
      'An ATS reads your resume as plain text before a human sees it. If it can’t parse your file cleanly, your skills never reach the recruiter.',
    detail:
      result.parseWarning ??
      `We read about ${parsePct}% of your resume clearly — a high parse rate helps ATS systems surface your skills.`,
    passText: `We parsed ${parsePct}% of your resume cleanly (${parsed.wordCount} words extracted).`,
  });

  // Contact — status driven by missing required fields (email + phone), LinkedIn warn
  const contactFound = contactItems(parsed);
  const missingRequired = contactFound.filter(
    (i) => (i.label === 'Email address' || i.label === 'Phone number') && !i.ok,
  );
  const missingLinkedIn = contactFound.some((i) => i.label === 'LinkedIn profile' && !i.ok);
  let contactStatus: AtsReportCheck['status'] = 'pass';
  let contactScore = 100;
  if (missingRequired.length > 0) {
    contactStatus = 'fail';
    contactScore = Math.max(20, 100 - missingRequired.length * 40);
  } else if (missingLinkedIn) {
    contactStatus = 'warn';
    contactScore = 70;
  }
  const contactIssueCount =
    missingRequired.length + (missingLinkedIn && contactStatus !== 'pass' ? 1 : 0);

  checks.push({
    id: 'fact-contact',
    weaknessId: 'contactInfo',
    criterionKey: 'contactInfo',
    label: 'Contact Information',
    score: contactScore,
    status: contactStatus,
    summary: statusSummary(contactStatus, contactIssueCount),
    education:
      'Recruiters spend seconds looking for a way to reach you. Missing phone, email or LinkedIn is the fastest way to lose an interested reader.',
    detail:
      contactStatus === 'pass'
        ? 'Your contact details are complete and easy to find.'
        : missingRequired.length
          ? `Missing: ${missingRequired.map((m) => m.label).join(', ')}.`
          : 'LinkedIn URL missing — add linkedin.com/in/… so recruiters can verify you.',
    passText: 'Your contact details are complete and easy to find.',
    foundItems: contactFound,
  });

  // Essential sections
  const secs = sectionItems(parsed);
  const missingRequiredSecs = secs.filter(
    (s) =>
      !s.ok &&
      parsed.sections.find((p) => p.label === s.label)?.required,
  );
  const missingSummary = secs.some((s) => s.label === 'Summary' && !s.ok);
  let secStatus: AtsReportCheck['status'] = 'pass';
  let secScore = 100;
  if (missingRequiredSecs.length > 0) {
    secStatus = 'fail';
    secScore = Math.max(25, 100 - missingRequiredSecs.length * 30);
  } else if (missingSummary) {
    secStatus = 'warn';
    secScore = 70;
  }

  checks.push({
    id: 'fact-sections',
    weaknessId: 'sectionStructure',
    criterionKey: 'sectionStructure',
    label: 'Essential Sections',
    score: secScore,
    status: secStatus,
    summary: statusSummary(
      secStatus,
      missingRequiredSecs.length + (missingSummary ? 1 : 0),
    ),
    education:
      'ATS systems map your resume into standard sections. Missing or oddly named headings mean whole blocks of your experience get skipped.',
    detail:
      secStatus === 'pass'
        ? `We found the standard sections: ${secs.filter((s) => s.ok).map((s) => s.label).join(', ')}.`
        : missingRequiredSecs.length
          ? `Missing required sections: ${missingRequiredSecs.map((s) => s.label).join(', ')}.`
          : 'No Summary / Profile heading — add a short summary so ATS and recruiters see your pitch first.',
    passText: `We found: ${secs.filter((s) => s.ok).map((s) => s.label).join(', ')}.`,
    foundItems: secs,
  });

  // Bullets vs prose
  const bulletStatus: AtsReportCheck['status'] =
    parsed.bulletCount >= 4 ? 'pass' : parsed.bulletCount >= 1 ? 'warn' : 'fail';
  const bulletScore =
    parsed.bulletCount >= 4 ? 90 : parsed.bulletCount >= 1 ? 55 : 15;
  const proseQuotes = parsed.proseDutyLines.slice(0, 3).map((t) => ({ text: t }));

  checks.push({
    id: 'fact-bullets',
    weaknessId: 'bulletQuality',
    criterionKey: 'bulletQuality',
    label: 'Bullets Consistency',
    score: bulletScore,
    status: bulletStatus,
    summary: statusSummary(
      bulletStatus,
      bulletStatus === 'pass' ? 0 : Math.max(1, proseQuotes.length),
    ),
    education:
      'ATS and recruiters both scan bullets first. Plain paragraphs under Experience often get skipped or mis-parsed.',
    detail:
      bulletStatus === 'pass'
        ? `Found ${parsed.bulletCount} bullet lines — scannable for recruiters and ATS.`
        : parsed.bulletCount === 0
          ? 'No bullet markers found. Rewrite experience as "- " bullets ATS can read.'
          : `Only ${parsed.bulletCount} bullet(s) found — expand experience into clear "- " bullets.`,
    passText: `Found ${parsed.bulletCount} bullet lines.`,
    quotes: bulletStatus === 'pass' ? [] : proseQuotes,
  });

  // Dates — MM/YYYY and Month YYYY both pass; only year-only tenure lines warn
  let dateStatus: AtsReportCheck['status'] = 'pass';
  let dateScore = 90;
  let dateDetail = 'Your dates include months — ATS can compute experience correctly.';
  const dateQuotes: Array<{ text: string }> = [];

  if (parsed.dateTokens.length === 0) {
    dateStatus = 'warn';
    dateScore = 50;
    dateDetail = 'Few or no date tokens found. Add Month/Year (or MM/YYYY) on each role.';
  } else if (parsed.hasMonthInDates) {
    dateStatus = 'pass';
    dateScore = 90;
    dateDetail = 'Dates use month+year (e.g. MM/YYYY or Month YYYY) — ATS can parse tenure.';
  } else if (parsed.yearOnlyDateLines.length > 0) {
    dateStatus = 'warn';
    dateScore = 55;
    dateDetail =
      'Some tenure lines show years only. Prefer MM/YYYY or Month YYYY so ATS doesn’t under-count experience.';
    dateQuotes.push(...parsed.yearOnlyDateLines.slice(0, 3).map((t) => ({ text: t })));
  }

  checks.push({
    id: 'fact-dates',
    weaknessId: 'dateConsistency',
    criterionKey: 'dateConsistency',
    label: 'Dates & Links',
    score: dateScore,
    status: dateStatus,
    summary: statusSummary(dateStatus, dateQuotes.length),
    education:
      'ATS systems calculate years of experience from dates. Month+year (11/2022 or Nov 2022) is enough — both forms are valid.',
    detail: dateDetail,
    passText: dateDetail,
    quotes: dateQuotes,
  });

  // Length
  const wc = parsed.wordCount;
  let lengthStatus: AtsReportCheck['status'] = 'pass';
  let lengthScore = 85;
  let lengthDetail = `At ${wc} words, your resume length sits in a readable range.`;
  if (wc < 150) {
    lengthStatus = 'fail';
    lengthScore = 30;
    lengthDetail = `Very short (${wc} words) — ATS may treat this as incomplete.`;
  } else if (wc < 250) {
    lengthStatus = 'warn';
    lengthScore = 55;
    lengthDetail = `Light on content (${wc} words). Aim for a focused 400–800 words for experienced roles.`;
  } else if (wc > 1200) {
    lengthStatus = 'warn';
    lengthScore = 55;
    lengthDetail = `Long (${wc} words). Tighten to 1–2 pages so recruiters finish reading.`;
  }

  checks.push({
    id: 'fact-length',
    weaknessId: 'lengthReadability',
    criterionKey: 'lengthReadability',
    label: 'Length & Density',
    score: lengthScore,
    status: lengthStatus,
    summary: statusSummary(lengthStatus, lengthStatus === 'pass' ? 0 : 1),
    education:
      'Recruiters give a resume 6–8 seconds on the first pass. The right length decides whether they keep reading.',
    detail: lengthDetail,
    passText: lengthDetail,
  });

  // File format
  const hints: FileHints | undefined = result.fileHints;
  if (hints) {
    const fq = hints.formatQuality;
    const fileStatus: AtsReportCheck['status'] =
      fq === 'best' || fq === 'good' ? 'pass' : fq === 'poor' ? 'fail' : 'warn';
    checks.push({
      id: 'fact-file',
      criterionKey: 'formatCleanliness',
      label: 'File Format & Size',
      status: fileStatus,
      summary: statusSummary(fileStatus),
      education:
        'PDF and DOCX parse best. Exotic formats or scanned images often reach the ATS as empty files.',
      detail:
        hints.formatAdvice ??
        `Detected .${hints.extension || 'unknown'} upload.`,
      passText: `You uploaded a .${hints.extension || 'pdf'} file — a format major ATS systems read reliably.`,
    });
  }

  // Format cleanliness from legacy score (columns / fancy chars) — keep as soft fact
  const fmtScore = result.breakdown.formatCleanliness.score;
  const fmtStatus: AtsReportCheck['status'] =
    fmtScore >= 75 ? 'pass' : fmtScore >= 50 ? 'warn' : 'fail';
  checks.push({
    id: 'fact-format',
    weaknessId: 'formatCleanliness',
    criterionKey: 'formatCleanliness',
    label: 'Design & Format',
    score: fmtScore,
    status: fmtStatus,
    summary: statusSummary(fmtStatus, fmtStatus === 'pass' ? 0 : 1),
    education:
      'Fancy characters, tables and text boxes confuse ATS parsers. Clean, simple formatting keeps every line readable.',
    detail: result.breakdown.formatCleanliness.feedback,
    passText: 'No major formatting traps detected from the extracted text.',
  });

  return checks;
}
