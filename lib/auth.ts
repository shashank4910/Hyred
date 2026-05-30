/**
 * Legacy password helpers — retained ONLY for the browser-extension auth
 * exchange (`/api/extension/auth`), which trades APP_PASSWORD for a long-lived
 * extension JWT. The web app's user auth is now Supabase Auth (see
 * lib/supabase/* and lib/current-user.ts); the old single-password session
 * (jr_session cookie) has been removed.
 */

/**
 * Constant-time password comparison.
 */
export function comparePasswords(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export function getAppPassword(): string {
  const p = process.env.APP_PASSWORD;
  if (!p || p.length < 6) {
    throw new Error('APP_PASSWORD must be set and at least 6 chars');
  }
  return p;
}
