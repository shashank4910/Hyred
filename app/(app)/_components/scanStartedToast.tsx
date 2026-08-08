'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { X, Zap } from 'lucide-react';

import { SCAN_STARTED_TOAST_ID } from '@/lib/scan-toast-id';
import { setScanUiActive } from '@/lib/scan-ui-active';

/**
 * Progressive scan steps — short, punchy lines that keep the user
 * informed without taking up too much space.
 */
const STEPS = [
  { delay: 0, text: 'Reaching out to job boards\u2026' },
  { delay: 10_000, text: 'Sources responding \u2014 collecting listings\u2026' },
  { delay: 22_000, text: 'Filtering out irrelevant roles\u2026' },
  { delay: 38_000, text: 'Starting AI scoring against your resume\u2026' },
  { delay: 60_000, text: 'Scoring each job individually\u2026' },
  { delay: 90_000, text: 'Still scoring \u2014 many good candidates\u2026' },
  { delay: 130_000, text: 'Almost done \u2014 wrapping up final matches\u2026' },
  { delay: 180_000, text: 'Taking longer than usual \u2014 nearly there\u2026' },
  { delay: 250_000, text: 'Final stretch \u2014 results any second!' },
];

function formatElapsed(sec: number): string {
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

/**
 * Compact scan progress card. One small toast that:
 * - Shows a live elapsed counter (user always sees movement)
 * - Updates the status text at staggered intervals
 * - Stays small enough not to block job cards on desktop or mobile
 * - Single toast.custom() call — React state handles progression
 */
function ScanCard() {
  const [stepIndex, setStepIndex] = useState(0);
  const [elapsedSec, setElapsedSec] = useState(0);

  useEffect(() => {
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
  }, []);

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-auto w-[min(100vw-2rem,20rem)] rounded-xl border border-outline-variant/30 bg-surface-container-lowest shadow-elevated overflow-hidden"
    >
      {/* Compact body */}
      <div className="flex items-center gap-2.5 px-3 py-2.5">
        {/* Teal icon */}
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg teal-gradient text-on-primary">
          <Zap className="h-3.5 w-3.5 fill-current" />
        </div>

        {/* Status text + elapsed */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold text-on-surface truncate">
              {STEPS[stepIndex].text}
            </p>
            <span className="inline-flex items-center gap-1 shrink-0 text-[10px] font-mono font-semibold tabular-nums text-primary">
              <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
              {formatElapsed(elapsedSec)}
            </span>
          </div>
          <p className="mt-0.5 text-[10px] text-on-surface-variant">
            Usually 1–5 min · You can keep browsing
          </p>
        </div>

        {/* Dismiss */}
        <button
          type="button"
          onClick={() => {
            setScanUiActive(false);
            toast.dismiss(SCAN_STARTED_TOAST_ID);
          }}
          className="shrink-0 rounded p-0.5 text-on-surface-variant/60 hover:text-on-surface transition-colors"
          aria-label="Dismiss"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Thin progress shimmer */}
      <div className="h-0.5 bg-primary/10 overflow-hidden">
        <div className="scan-started-shimmer h-full w-1/3 rounded-r-full bg-primary/40" />
      </div>
    </div>
  );
}

/**
 * Show the compact scan progress card. Called once per scan.
 * The ScanCard React component manages its own timer state internally.
 */
export function showScanStartedToast(options?: { onboarding?: boolean }) {
  void options; // onboarding flag reserved for future copy variants
  setScanUiActive(true);
  toast.custom(() => <ScanCard />, {
    id: SCAN_STARTED_TOAST_ID,
    duration: Infinity,
    dismissible: true,
    // ScanCard has its own dismiss control; Sonner's chrome would look like a 2nd card
    closeButton: false,
  });
}

/** Dismiss the scan card. Sonner unmounts ScanCard → useEffect cleanup fires. */
export function dismissScanStartedToast() {
  setScanUiActive(false);
  toast.dismiss(SCAN_STARTED_TOAST_ID);
}
