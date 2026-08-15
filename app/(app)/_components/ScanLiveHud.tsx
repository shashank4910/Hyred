'use client';

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { toast } from 'sonner';
import { useScanUiActive, setScanUiActive } from '@/lib/scan-ui-active';
import { dismissScanStartedToast } from './scanStartedToast';

const STEPS = [
  { delay: 0, text: 'Reaching job boards…' },
  { delay: 10_000, text: 'Collecting listings…' },
  { delay: 22_000, text: 'Filtering roles…' },
  { delay: 38_000, text: 'Scoring against your resume…' },
  { delay: 60_000, text: 'Scoring each job…' },
  { delay: 90_000, text: 'Still scoring…' },
  { delay: 130_000, text: 'Wrapping up matches…' },
  { delay: 180_000, text: 'Taking a bit longer…' },
  { delay: 250_000, text: 'Final stretch…' },
];

function formatElapsed(sec: number): string {
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

/** Non-blocking live scan HUD. Does not cover or lock the page. */
export function ScanLiveHud() {
  const active = useScanUiActive();
  const [stepIndex, setStepIndex] = useState(0);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    if (!active) {
      setStepIndex(0);
      setElapsedSec(0);
      return;
    }
    const startedAt = Date.now();
    const counter = setInterval(() => {
      setElapsedSec(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
    const timers = STEPS.slice(1).map((step, i) =>
      setTimeout(() => setStepIndex(i + 1), step.delay),
    );
    return () => {
      clearInterval(counter);
      timers.forEach(clearTimeout);
    };
  }, [active]);

  if (!active) return null;

  async function cancelScan() {
    setCancelling(true);
    try {
      await fetch('/api/ingest/cancel', { method: 'POST' });
    } finally {
      setCancelling(false);
      dismissScanStartedToast();
      toast.success('Scan stopped. Matches already found stay on your dashboard.', { duration: 6000 });
    }
  }

  return (
    <div className="pointer-events-none fixed bottom-24 right-4 z-[70] lg:bottom-6">
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-auto flex w-[min(100vw-2rem,18.5rem)] items-center gap-3 rounded-full bg-white p-2 pr-3 shadow-elevated"
      >
        <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-full bg-primary">
          <div
            className="scan-radar-sweep absolute inset-0 rounded-full"
            style={{
              background:
                'conic-gradient(from 0deg, transparent 0deg, #72D35F 70deg, transparent 90deg)',
            }}
            aria-hidden
          />
          <span className="absolute inset-[7px] rounded-full bg-primary" />
          <span className="absolute inset-[15px] rounded-full bg-lime-brand" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-semibold text-ink">{STEPS[stepIndex].text}</p>
          <p className="text-[11px] tabular-nums text-on-surface-variant">
            {formatElapsed(elapsedSec)} · keep browsing
          </p>
        </div>
        <button
          type="button"
          onClick={cancelScan}
          disabled={cancelling}
          className="shrink-0 rounded-full px-2 py-1 text-[11px] font-semibold text-error hover:bg-red-50"
        >
          {cancelling ? '…' : 'Stop'}
        </button>
        <button
          type="button"
          onClick={() => {
            setScanUiActive(false);
          }}
          className="shrink-0 rounded-full p-1 text-on-surface-variant hover:text-ink"
          aria-label="Hide scan status"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
