/**
 * LinkedIn free People-search URL helpers for Find an insider.
 */

export function buildLinkedInPeerUrl(company: string): string {
  const q = encodeURIComponent(company.trim());
  return `https://www.linkedin.com/search/results/people/?keywords=${q}&network=%5B%22F%22%5D`;
}

export function buildLinkedIn2ndUrl(company: string): string {
  const q = encodeURIComponent(company.trim());
  return `https://www.linkedin.com/search/results/people/?keywords=${q}&network=%5B%22S%22%5D`;
}

/**
 * People search for TA / HR at a company.
 * - Quote the company via encodeURIComponent so a leading `"` cannot break an href.
 * - Parentheses keep OR scoped to role terms (not "anyone with HR").
 * - No network filter: recruiting teams are often outside 1st/2nd connections.
 * - Skip explicit AND (spaces already mean AND on LinkedIn people search).
 */
export function buildLinkedInRecruiterUrl(company: string): string {
  const name = company.trim();
  const q = encodeURIComponent(
    `"${name}" (recruiter OR "talent acquisition" OR "human resources" OR "talent partner" OR HR)`,
  );
  return `https://www.linkedin.com/search/results/people/?keywords=${q}`;
}
