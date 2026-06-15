/**
 * Extension JWT helpers.
 *
 * The extension uses a long-lived JWT (90 days) stored in chrome.storage.local.
 * The JWT now carries the user's profile_id so every API call is scoped to the
 * correct user — no more first-profile pattern.
 *
 * Two issuance flows:
 *   1. /api/extension/auth   — legacy APP_PASSWORD exchange (kept for fallback)
 *   2. /api/extension/session — Supabase session cookie exchange (primary)
 */
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

export type ExtJwtPayload = {
  scope: string;
  profile_id?: string;
  sub?: string;
};

/**
 * Issue a long-lived JWT for an installed browser extension.
 * @param profileId - The user's profile_id (undefined for legacy APP_PASSWORD flow)
 */
export async function signExtensionToken(profileId?: string): Promise<string> {
  const payload: Record<string, unknown> = { scope: 'extension' };
  if (profileId) payload.profile_id = profileId;

  return new SignJWT(payload)
    .setProtectedHeader({ alg: ALG })
    .setIssuedAt()
    .setAudience(AUDIENCE)
    .setExpirationTime('90d')
    .sign(getSecret());
}

/**
 * Verify a Bearer token and return its decoded payload.
 * Returns null if the token is invalid/expired.
 */
export async function verifyExtensionToken(
  token: string | undefined,
): Promise<ExtJwtPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getSecret(), {
      algorithms: [ALG],
      audience: AUDIENCE,
    });
    return payload as unknown as ExtJwtPayload;
  } catch {
    return null;
  }
}

/** Extract the Bearer token from an incoming request. */
export function bearer(req: NextRequest): string | undefined {
  const h = req.headers.get('authorization') ?? '';
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m?.[1];
}

/**
 * Convenience guard: returns the decoded JWT payload if the request has a valid
 * extension token, or null if unauthorised.
 *
 * Usage in route handlers:
 *   const auth = await isExtAuthed(req);
 *   if (!auth) return corsResponse({ error: 'unauthorized' }, { status: 401 });
 *   const profileId = auth.profile_id;  // may be undefined for legacy tokens
 */
export async function isExtAuthed(
  req: NextRequest,
): Promise<ExtJwtPayload | null> {
  return verifyExtensionToken(bearer(req));
}
