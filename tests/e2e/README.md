# End-to-end tests (Playwright)

Requires optional auth for most specs:

```bash
export TEST_USER_EMAIL=your-test-user@example.com
export TEST_USER_PASSWORD=your-password
npx playwright test
```

Public specs run without credentials (`public-pages.spec.ts`).

Auth session is saved to `tests/e2e/.auth/user.json` (gitignored).

See **`docs/testing/pr-test-matrix.md`** for the full PR → test case map.
