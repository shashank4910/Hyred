'use client';

import { toast } from 'sonner';

export type JobScanResult = {
  matchesCreated: number;
  fetched: number;
  scored: number;
};

/**
 * Run a per-user ingest scan (POST /api/ingest). For auto-onboarding flows, shows
 * a "started" loading state then a "complete" success message when the request
 * finishes (typically 1–2 minutes).
 */
export async function triggerJobScan(options?: {
  /** First-time onboarding auto-scan copy */
  autoFlow?: boolean;
  sources?: string[];
  onComplete?: (result: JobScanResult) => void;
}): Promise<JobScanResult | null> {
  const sourceCount = options?.sources?.length ?? 0;

  if (options?.autoFlow) {
    toast.info('Your job scan has started. Check Matches in about 1–2 minutes.', {
      duration: 8000,
    });
  }

  const toastId = toast.loading(
    options?.autoFlow
      ? 'Your job scan has started. This usually takes 1–2 minutes…'
      : sourceCount > 0
        ? `Scanning ${sourceCount} source${sourceCount > 1 ? 's' : ''}…`
        : 'Scanning job boards…',
    { duration: 600_000 },
  );

  try {
    const body: { triggeredBy?: string; sources?: string[] } = {};
    if (options?.autoFlow) body.triggeredBy = 'onboarding';
    if (options?.sources?.length) body.sources = options.sources;

    const res = await fetch('/api/ingest', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: Object.keys(body).length > 0 ? JSON.stringify(body) : undefined,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Scan failed');

    const result: JobScanResult = {
      matchesCreated: data.matchesCreated ?? 0,
      fetched: data.fetched ?? 0,
      scored: data.scored ?? 0,
    };

    if (options?.autoFlow) {
      const n = result.matchesCreated;
      toast.success(
        n > 0
          ? `Scan complete! We found ${n} relevant job${n === 1 ? '' : 's'} for you.`
          : 'Scan complete. No strong matches yet — try broadening roles or locations in your profile.',
        { id: toastId, duration: 10_000 },
      );
    } else {
      toast.success(
        `${result.matchesCreated} new match${result.matchesCreated === 1 ? '' : 'es'} · ${result.fetched} jobs scanned`,
        { id: toastId },
      );
    }

    options?.onComplete?.(result);
    return result;
  } catch (e) {
    toast.error((e as Error).message, { id: toastId });
    return null;
  }
}
