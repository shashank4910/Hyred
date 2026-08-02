/**
 * Hand-off payload so Fix Studio can open in a new browser tab
 * while the ATS report stays on the original tab.
 *
 * Uses localStorage (not sessionStorage) so the new tab can read it
 * even when opened with noopener / target=_blank.
 */

import type { AtsCheckResult } from './ats-checker';

export const ATS_FIX_SESSION_KEY = 'hyred_ats_fix_session_v1';

export interface AtsFixSessionPayload {
  resume: string;
  result: AtsCheckResult;
  jobDescription?: string;
  filename?: string | null;
  /** data URL for PDF/image preview (blob URLs do not work across tabs) */
  originalFileDataUrl?: string | null;
  originalFileKind?: 'pdf' | 'image' | null;
  createdAt: number;
}

export function writeAtsFixSession(payload: Omit<AtsFixSessionPayload, 'createdAt'>): void {
  const full: AtsFixSessionPayload = { ...payload, createdAt: Date.now() };
  try {
    localStorage.setItem(ATS_FIX_SESSION_KEY, JSON.stringify(full));
    return;
  } catch {
    /* QuotaExceeded — retry without heavy original file bytes */
  }
  try {
    const slim: AtsFixSessionPayload = {
      ...full,
      originalFileDataUrl: null,
      originalFileKind: null,
    };
    localStorage.setItem(ATS_FIX_SESSION_KEY, JSON.stringify(slim));
  } catch {
    /* last resort: clear stale session then try slim again */
    try {
      localStorage.removeItem(ATS_FIX_SESSION_KEY);
      localStorage.setItem(
        ATS_FIX_SESSION_KEY,
        JSON.stringify({
          resume: full.resume,
          result: full.result,
          jobDescription: full.jobDescription,
          filename: full.filename,
          createdAt: full.createdAt,
        } satisfies AtsFixSessionPayload),
      );
    } catch {
      /* caller will see expired session if write fully failed */
    }
  }
}

export function readAtsFixSession(): AtsFixSessionPayload | null {
  try {
    const raw = localStorage.getItem(ATS_FIX_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AtsFixSessionPayload;
    if (!parsed?.resume || !parsed?.result) return null;
    // Expire after 2 hours
    if (parsed.createdAt && Date.now() - parsed.createdAt > 2 * 60 * 60 * 1000) {
      localStorage.removeItem(ATS_FIX_SESSION_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function clearAtsFixSession(): void {
  try {
    localStorage.removeItem(ATS_FIX_SESSION_KEY);
  } catch {
    /* ignore */
  }
}

/** Convert a blob:/object URL into a data URL for cross-tab preview. */
export async function blobUrlToDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    // Cap ~4.5MB so we stay under typical sessionStorage limits
    if (blob.size > 4.5 * 1024 * 1024) return null;
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}
