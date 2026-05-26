import { NextRequest } from 'next/server';
import { jwtVerify, SignJWT } from 'jose';

const ALG = 'HS256';
const AUDIENCE = 'jobradar-extension';

function getSecret(): Uint8Array {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 16) {
    throw new Error('AUTH_SECRET must be set and at least 16 chars');
  }
  return new TextEncoder().encode(s);
}

/**
 * Issue a long-lived JWT for an installed browser extension.
 * Lifetime: 90 days. Rotate by re-running the auth flow in the popup.
 */
export async function signExtensionToken(): Promise<string> {
  return new SignJWT({ scope: 'extension' })
    .setProtectedHeader({ alg: ALG })
    .setIssuedAt()
    .setAudience(AUDIENCE)
    .setExpirationTime('90d')
    .sign(getSecret());
}

/** Verify a Bearer token. Returns true if valid. */
export async function verifyExtensionToken(
  token: string | undefined,
): Promise<boolean> {
  if (!token) return false;
  try {
    await jwtVerify(token, getSecret(), {
      algorithms: [ALG],
      audience: AUDIENCE,
    });
    return true;
  } catch {
    return false;
  }
}

/** Extract the Bearer token from an incoming request. */
export function bearer(req: NextRequest): string | undefined {
  const h = req.headers.get('authorization') ?? '';
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m?.[1];
}

/** Convenience guard: returns true if request has a valid extension JWT. */
export async function isExtAuthed(req: NextRequest): Promise<boolean> {
  return verifyExtensionToken(bearer(req));
}
