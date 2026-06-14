# Testing — Hyred

> One **test case per merged PR**. See the full matrix below.

## Quick start

```bash
# Regenerate matrix after new PR merges
npm run test:matrix

# Unit + meta tests (fast, no browser)
npm run test

# Public E2E only (no login required — runs in CI)
npm run test:e2e:public

# Full E2E (requires test user)
export TEST_USER_EMAIL=...
export TEST_USER_PASSWORD=...
npm run test:e2e
```

## Files

| File | Purpose |
|------|---------|
| [pr-test-matrix.md](./pr-test-matrix.md) | Human-readable table: PR → test case |
| `tests/pr-coverage.json` | Machine-readable registry (used by meta tests) |
| `scripts/generate-pr-test-matrix.mjs` | Regenerates matrix from `gh pr list` |
| `tests/unit/` | Automated unit tests (Vitest) |
| `tests/e2e/` | Browser tests (Playwright) |
| `tests/meta/pr-coverage.test.ts` | Fails if any PR lacks a test case entry |

## Adding tests for a new PR

1. Merge your PR.
2. Run `npm run test:matrix`.
3. Implement the automated test in the file listed under **Automated in** (or add an override in the generator script).
4. Name tests with PR tags: `PR #123 description`.

## CI

`.github/workflows/test.yml` runs on every PR: typecheck, unit tests, public E2E.

Authenticated E2E runs locally or via secrets `TEST_USER_EMAIL` / `TEST_USER_PASSWORD` (optional nightly job).
