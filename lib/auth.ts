import { SignJWT, jwtVerify } from 'jose';

const COOKIE_NAME = 'jr_session';
const ALG = 'HS256';

function getSecret(): Uint8Array {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 16) {
    throw new Error('AUTH_SECRET must be set and at least 16 chars');
  }
  return new TextEncoder().encode(s);
}

export const COOKIE = {
  name: COOKIE_NAME,
  options: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: 60 * 60 * 24 * 30, // 30 days
  },
};

/**
 * Sign a session token. Single-user app: payload is just an `ok` flag and issuance time.
 */
export async function signSession(): Promise<string> {
  return await new SignJWT({ ok: true })
    .setProtectedHeader({ alg: ALG })
    .setIssuedAt()
    .setExpirationTime('30d')
    .sign(getSecret());
}

export async function verifySession(token: string | undefined): Promise<boolean> {
  if (!token) return false;
  try {
    await jwtVerify(token, getSecret(), { algorithms: [ALG] });
    return true;
  } catch {
    return false;
  }
}

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
