'use client';

import { useState, useTransition, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, RefreshCw, ChevronDown, Zap, X } from 'lucide-react';
import { toast } from 'sonner';
import { triggerJobScan } from './triggerJobScan';

const ALL_SOURCES = [
  { id: 'linkedin', label: 'LinkedIn (guest API)', tokens: 'free' },
  { id: 'adzuna_in', label: 'Adzuna India', tokens: '~22/scan' },
  { id: 'jsearch', label: 'JSearch (Indeed+LinkedIn)', tokens: '5/scan' },
  { id: 'jobspipe', label: 'JobsPipe (30+ ATS)', tokens: '5/scan' },
  { id: 'jobdatalake', label: 'JobDataLake (enriched)', tokens: '5/scan' },
  { id: 'remotive', label: 'Remotive', tokens: 'free' },
  { id: 'remoteok', label: 'RemoteOK', tokens: 'free' },
  { id: 'hn', label: 'HN Who is Hiring', tokens: 'free' },
  { id: 'arbeitnow', label: 'Arbeitnow', tokens: 'free' },
];

/**
 * Progressive scan status messages — shown at staggered intervals so
 * the user always knows what's happening and never feels ghosted.
 * Each message replaces the previous one (same toast ID).
 */
const PROGRESS_MESSAGES = [
  // Immediately (0s)
  {
    delay: 0,
    message: 'Scan started \u2014 we\u2019re fetching fresh roles from job boards and scoring them against your resume. This usually takes 1\u20135 minutes depending on your roles, locations, and how many sources we\u2019re scanning.',
    icon: '\uD83D\uDD0D',
  },
  // 30s
  {
    delay: 30_000,
    message: 'Still working \u2014 fetching jobs from multiple sources and filtering out irrelevant ones. Your personalized matches are being prepared.',
    icon: '\u2699\uFE0F',
  },
  // 1.5 min
  {
    delay: 90_000,
    message: 'Scoring jobs against your resume now \u2014 each job gets individually analyzed by AI to check how well it matches your experience. Almost there!',
    icon: '\uD83E\uDDE0',
  },
  // 3 min
  {
    delay: 180_000,
    message: 'Still scoring \u2014 looks like there are quite a few potential matches this time. The AI is being thorough. Hang tight, results are coming!',
    icon: '\u23F3',
  },
  // 4.5 min
  {
    delay: 270_000,
    message: 'This is taking a bit longer than usual \u2014 likely because your profile matches many roles across sources. We\u2019re in the final stretch. Your matches will appear any moment.',
    icon: '\uD83C\uDFC1',
  },
];

export function RunIngestButton({
  isAdmin = false,
  luminous = false,
}: {
  isAdmin?: boolean;
  luminous?: boolean;
}) {
  const [running, setRunning] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [, startTransition] = useTransition();
  const router = useRouter();
  const [showSourcePicker, setShowSourcePicker] = useState(false);
  const [selectedSources, setSelectedSources] = useState<string[]>([]);
  const progressTimers = useRef<ReturnType<typeof setTimeout>[]>([]);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      progressTimers.current.forEach(clearTimeout);
    };
  }, []);

  function toggleSource(id: string) {
    setSelectedSources((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id],
    );
  }

  function startProgressMessages() {
    // Clear any existing timers
    progressTimers.current.forEach(clearTimeout);
    progressTimers.current = [];

    for (const step of PROGRESS_MESSAGES) {
      const timer = setTimeout(() => {
        toast.info(step.message, {
          id: 'scan-progress',
          duration: Infinity, // stays until replaced or dismissed
          icon: step.icon,
        });
      }, step.delay);
      progressTimers.current.push(timer);
    }
  }

  function stopProgressMessages() {
    progressTimers.current.forEach(clearTimeout);
    progressTimers.current = [];
    toast.dismiss('scan-progress');
  }

  async function run() {
    setRunning(true);
    startProgressMessages();

    try {
      await triggerJobScan({
        sources: selectedSources.length > 0 ? selectedSources : undefined,
      });
      startTransition(() => router.refresh());
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setRunning(false);
      setShowCancelConfirm(false);
      stopProgressMessages();
    }
  }

  async function cancelScan() {
    setCancelling(true);
    try {
      const res = await fetch('/api/ingest/cancel', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Cancel failed');
      toast.success('Scan cancelled. Any matches already found are still on your dashboard.', { duration: 6000 });
      setRunning(false);
      setShowCancelConfirm(false);
      stopProgressMessages();
      startTransition(() => router.refresh());
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setCancelling(false);
    }
  }

  return (
    <div className="relative isolate">
      <div className="flex items-center gap-0">
        {!running ? (
          <>
            <button
              onClick={run}
              disabled={running}
              className={
                isAdmin
                  ? 'btn-primary rounded-r-none'
                  : luminous
                    ? 'btn-primary gap-2 px-5 py-3'
                    : 'btn-primary'
              }
            >
              {luminous ? (
                <Zap className="h-4 w-4" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              {luminous ? 'Run Scan' : isAdmin && selectedSources.length > 0 ? `Scan (${selectedSources.length})` : 'Run scan'}
            </button>
            {isAdmin && (
              <button
                onClick={() => setShowSourcePicker((v) => !v)}
                disabled={running}
                className="btn-primary rounded-l-none border-l border-on-primary/20 px-2"
                title="Choose which sources to scan"
              >
                <ChevronDown className={`h-4 w-4 transition-transform ${showSourcePicker ? 'rotate-180' : ''}`} />
              </button>
            )}
          </>
        ) : (
          /* Running state: show scanning indicator + cancel button */
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-2 rounded-xl bg-primary/10 px-4 py-2.5 text-sm font-semibold text-primary">
              <Loader2 className="h-4 w-4 animate-spin" />
              Scanning...
            </span>
            <button
              onClick={() => setShowCancelConfirm(true)}
              disabled={cancelling}
              className="inline-flex items-center gap-1.5 rounded-xl border border-error/40 bg-error-container/20 px-3 py-2.5 text-sm font-semibold text-error hover:bg-error-container/40 transition-all"
              title="Cancel the running scan"
            >
              {cancelling ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <X className="h-3.5 w-3.5" />
              )}
              Cancel
            </button>
          </div>
        )}
      </div>

      {/* Cancel confirmation prompt */}
      {showCancelConfirm && (
        <div className="absolute right-0 top-full z-[100] mt-2 w-80 rounded-2xl border border-outline-variant bg-surface-container-lowest p-5 shadow-elevated animate-fade-in">
          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-error-container/30 text-error">
                <X className="h-4 w-4" />
              </div>
              <div>
                <h4 className="text-sm font-semibold text-on-surface">Cancel scan?</h4>
                <p className="mt-1 text-xs text-on-surface-variant leading-relaxed">
                  Your scan is still running and results are being processed. Any matches already found will stay on your dashboard, but remaining jobs won&apos;t be scored.
                </p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                onClick={() => setShowCancelConfirm(false)}
                className="btn-ghost text-xs"
              >
                Keep scanning
              </button>
              <button
                onClick={cancelScan}
                disabled={cancelling}
                className="inline-flex items-center gap-1.5 rounded-xl bg-error px-3 py-2 text-xs font-semibold text-on-error hover:bg-error/90 transition-all disabled:opacity-50"
              >
                {cancelling && <Loader2 className="h-3 w-3 animate-spin" />}
                Yes, cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Admin source picker */}
      {isAdmin && showSourcePicker && !running && (
        <div className="absolute right-0 top-full z-[100] mt-2 w-72 rounded-xl border border-outline-variant bg-surface-container-lowest p-3 shadow-elevated animate-fade-in">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-on-background">Select sources to scan</span>
            <button
              onClick={() => setSelectedSources([])}
              className="text-[10px] text-on-surface-variant hover:text-primary"
            >
              Clear (scan all)
            </button>
          </div>
          <div className="space-y-1">
            {ALL_SOURCES.map((s) => {
              const checked = selectedSources.includes(s.id);
              return (
                <label
                  key={s.id}
                  className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-all ${
                    checked ? 'bg-primary-fixed/50' : 'hover:bg-surface-container'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleSource(s.id)}
                    className="rounded border-border-muted text-primary focus:ring-primary/30"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium text-on-surface truncate">{s.label}</div>
                  </div>
                  <span className="text-[10px] text-on-surface-variant whitespace-nowrap">{s.tokens}</span>
                </label>
              );
            })}
          </div>
          <p className="mt-2 text-[10px] text-on-surface-variant">
            No selection = scan all. Select specific sources to save tokens.
          </p>
        </div>
      )}
    </div>
  );
}
