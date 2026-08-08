/**
 * Private "resumes" Storage helpers.
 *
 * Bucket is private — never use getPublicUrl for real access.
 * Store the object path in matches.tailored_resume_url; mint short-lived
 * signed URLs when a browser, extension, or apply agent needs to download.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

export const RESUMES_BUCKET = 'resumes';

/** Default TTL for UI / extension preview downloads. */
export const RESUME_SIGN_TTL_SEC = 60 * 60; // 1 hour

/** Longer TTL for the cloud apply agent (may queue before fetch). */
export const RESUME_SIGN_TTL_AGENT_SEC = 60 * 60 * 2; // 2 hours

/**
 * Normalize whatever we stored historically into a storage object path.
 * Accepts bare paths, public object URLs, or signed object URLs.
 */
export function resumeObjectPath(stored: string | null | undefined): string | null {
  if (!stored) return null;
  const raw = stored.trim();
  if (!raw) return null;

  if (!raw.includes('://')) {
    return raw.replace(/^\/+/, '');
  }

  const publicMatch = raw.match(/\/object\/public\/resumes\/(.+?)(?:\?|#|$)/i);
  if (publicMatch?.[1]) return decodeURIComponent(publicMatch[1]);

  const signMatch = raw.match(/\/object\/sign\/resumes\/(.+?)(?:\?|#|$)/i);
  if (signMatch?.[1]) return decodeURIComponent(signMatch[1]);

  const authenticatedMatch = raw.match(
    /\/object\/authenticated\/resumes\/(.+?)(?:\?|#|$)/i,
  );
  if (authenticatedMatch?.[1]) return decodeURIComponent(authenticatedMatch[1]);

  return null;
}

/** Idempotent: lock the resumes bucket so anonymous public URLs stop working. */
export async function ensureResumesBucketPrivate(
  sb: SupabaseClient,
): Promise<void> {
  const { error } = await sb.storage.updateBucket(RESUMES_BUCKET, {
    public: false,
  });
  if (error) {
    // Bucket may already be private, or Storage API may not allow update —
    // callers still use signed URLs; log and continue.
    console.warn('[resume-storage] updateBucket(public:false):', error.message);
  }
}

export async function uploadResumePdf(
  sb: SupabaseClient,
  objectPath: string,
  pdfBuffer: Buffer,
): Promise<{ error: Error | null }> {
  return uploadResumeFile(sb, objectPath, pdfBuffer, 'application/pdf');
}

/** Upload any resume source file (PDF/DOCX/…) into the private resumes bucket. */
export async function uploadResumeFile(
  sb: SupabaseClient,
  objectPath: string,
  buffer: Buffer,
  contentType: string,
): Promise<{ error: Error | null }> {
  await ensureResumesBucketPrivate(sb);
  const { error } = await sb.storage.from(RESUMES_BUCKET).upload(objectPath, buffer, {
    contentType: contentType || 'application/octet-stream',
    upsert: true,
  });
  return { error: error ? new Error(error.message) : null };
}

/** Stable path for the user's last onboarding upload. */
export function profileOriginalResumePath(
  profileId: string,
  filename: string,
): string {
  const base = filename.split(/[/\\]/).pop() || 'resume';
  const safe = base
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
  return `${profileId}/original/${safe || 'resume.bin'}`;
}

export function guessResumeMime(
  filename: string,
  fallback?: string | null,
): string {
  if (fallback && fallback !== 'application/octet-stream') return fallback;
  const lower = filename.toLowerCase();
  if (lower.endsWith('.pdf')) return 'application/pdf';
  if (lower.endsWith('.docx')) {
    return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  }
  if (lower.endsWith('.doc')) return 'application/msword';
  if (lower.endsWith('.txt')) return 'text/plain';
  return 'application/octet-stream';
}

/**
 * Mint a signed download URL for a stored path or legacy public/signed URL.
 * Returns null if the value cannot be resolved to an object path.
 */
export async function signResumeUrl(
  sb: SupabaseClient,
  storedOrPath: string | null | undefined,
  expiresInSec: number = RESUME_SIGN_TTL_SEC,
): Promise<string | null> {
  const path = resumeObjectPath(storedOrPath);
  if (!path) return null;

  const { data, error } = await sb.storage
    .from(RESUMES_BUCKET)
    .createSignedUrl(path, expiresInSec);

  if (error || !data?.signedUrl) {
    console.warn('[resume-storage] createSignedUrl failed:', error?.message ?? 'no url');
    return null;
  }
  return data.signedUrl;
}
