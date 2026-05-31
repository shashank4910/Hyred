'use client';

import { toast } from 'sonner';
import { formatIngestWarnings, readableError } from '@/lib/ui';

export type JobScanResult = {
  matchesCreated: number;
  fetched: number;
  scored: number;
};

const DONE_TOAST = { duration: 8000 } as const;

/**
 * Run a per-user ingest scan (POST /api/ingest). Manual scans rely on the Run scan
 * button state; auto-onboarding shows a brief info toast then success when done.
 */
export async function triggerJobScan(options?: {
  /** First-time onboarding auto-scan copy */
  autoFlow?: boolean;
  sources?: string[];
  onComplete?: (result: JobScanResult) => void;
}): Promise<JobScanResult | null> {
  if (options?.autoFlow) {
    toast.info('Your job scan has started. Check Matches in about 1–2 minutes.', {
      duration: 8000,
    });
  }

  try {
    const body: { triggeredBy?: string; sources?: string[] } = {};
    if (options?.autoFlow) body.triggeredBy = 'onboarding';
    if (options?.sources?.length) body.sources = options.sources;

    const res = await fetch('/api/ingest', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: Object.keys(body).length > 0 ? JSON.stringify(body) : undefined,
    });

    let data: Record<string, unknown> = {};
    try {
      data = (await res.json()) as Record<string, unknown>;
    } catch {
      if (!res.ok) {
        throw new Error(`Scan failed (${res.status})`);
      }
    }

    if (!res.ok) {
      throw new Error(readableError(data.error ?? data, 'Scan failed'));
    }

    const result: JobScanResult = {
      matchesCreated: Number(data.matchesCreated ?? 0),
      fetched: Number(data.fetched ?? 0),
      scored: Number(data.scored ?? 0),
    };

    const warnings = formatIngestWarnings(data.errors);
    if (warnings) {
      toast.warning(warnings, { duration: 12_000 });
    }

    if (options?.autoFlow) {
      const n = result.matchesCreated;
      toast.success(
        n > 0
          ? `Scan complete! We found ${n} relevant job${n === 1 ? '' : 's'} for you.`
          : 'Scan complete. No strong matches yet — try broadening roles or locations in your profile.',
        DONE_TOAST,
      );
    } else {
      toast.success(
        `${result.matchesCreated} new match${result.matchesCreated === 1 ? '' : 'es'} · ${result.fetched} jobs scanned`,
        DONE_TOAST,
      );
    }

    options?.onComplete?.(result);
    return result;
  } catch (e) {
    toast.error(readableError(e, 'Scan failed'), DONE_TOAST);
    return null;
  }
}
