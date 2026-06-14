/** Prefix Playwright/Vitest titles with PR numbers for traceability to pr-test-matrix.md */
export function prTitle(prNumbers: number | number[], description: string): string {
  const nums = Array.isArray(prNumbers) ? prNumbers : [prNumbers];
  const tag = nums.map((n) => `#${n}`).join(' ');
  return `${tag} ${description}`;
}
