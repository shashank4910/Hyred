'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { BarChart3, FileText, Sparkles, X, Zap } from 'lucide-react';

import { SCAN_STARTED_TOAST_ID } from '@/lib/scan-toast-id';

const QUICK_LINKS = [
  { href: '/stats', label: 'Stats', icon: BarChart3 },
  { href: '/onboarding', label: 'My Resume', icon: FileText },
  { href: '/?status=inbox', label: 'Matches', icon: Sparkles },
] as const;

/**
 * Progressive scan steps. The ScanCard React component below progresses
 * through these internally — one toast.custom() call, one card, evolving
 * heading + body + CTA. Granular delays so the user never feels ghosted.
 */
type Step = {
  delay: number;
  heading: string;
  body: string;
  cta: string;
};

const STEPS: Step[] = [
  {
    delay: 0,
    heading: 'Scan started \u2014 we\u2019re on it',
    body: 'Reaching out to job boards now to fetch fresh roles tailored to your resume.',
    cta: 'Hang tight \u2014 usually takes 1\u20135 minutes. We\u2019ll notify you when it\u2019s done.',
  },
  {
    delay: 12_000,
    heading: 'Pulling listings\u2026',
    body: 'Sources are responding. Collecting jobs that match your search keywords.',
    cta: 'Feel free to keep browsing \u2014 we\u2019ll handle this in the background.',
  },
  {
    delay: 28_000,
    heading: 'Filtering by relevance',
    body: 'Sifting through hundreds of listings to find the ones actually worth scoring.',
    cta: 'This smart filter saves time on the AI scoring step.',
  },
  {
    delay: 50_000,
    heading: 'AI scoring is starting',
    body: 'Each shortlisted job is being analyzed against your resume \u2014 skills, experience, and location fit.',
    cta: 'This is the longest step. Each job takes a few seconds individually.',
  },
  {
    delay: 90_000,
    heading: 'Scoring in progress\u2026',
    body: 'About halfway through your shortlist. Each match is getting a score and a personalized reason.',
    cta: 'Almost there \u2014 your matches will appear automatically.',
  },
  {
    delay: 150_000,
    heading: 'Hang tight \u2014 lots of matches',
    body: 'Looks like you have many potential matches. The AI is being thorough so your scores are accurate.',
    cta: 'Quality over speed \u2014 your dashboard will update soon.',
  },
  {
    delay: 220_000,
    heading: 'Wrapping up',
    body: 'Final scoring rounds + saving the top matches to your dashboard.',
    cta: 'Any moment now \u2014 thanks for your patience!',
  },
  {
    delay: 320_000,
    heading: 'Final stretch',
    body: 'A few stubborn jobs are taking extra time to score. Your matches are nearly ready.',
    cta: 'We haven\u2019t forgotten about you \u2014 results coming any second!',
  },
];

function formatElapsed(sec: number): string {
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}m ${s.toString().padStart(2, '0')}s`;
}

/**
 * The actual toast card. Lives as a React component so it can manage its
 * own progressive state (current step + live elapsed counter) inside a
 * SINGLE toast.custom() call — no risk of duplicate cards from repeated
 * toast.custom calls.
 */
function ScanCard({ onboarding }: { onboarding: boolean }) {
  const [stepIndex, setStepIndex] = useState(0);
  const [elapsedSec, setElapsedSec] = useState(0);

  useEffect(() => {
    const startedAt = Date.now();

    // Live elapsed-time counter (ticks every second so the user always
    // sees movement and never thinks the app is dead).
    const counter = setInterval(() => {
      setElapsedSec(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);

    // Schedule each step transition. We skip index 0 because it's already
    // the initial state.
    const stepTimers = STEPS.slice(1).map((step, i) =>
      setTimeout(() => setStepIndex(i + 1), step.delay),
    );

    return () => {
      clearInterval(counter);
      stepTimers.forEach(clearTimeout);
    };
  }, []);

  const step = STEPS[stepIndex];
  const bodyText =
    onboarding && stepIndex === 0
      ? 'Pulling roles matched to your new resume from job boards across the web.'
      : step.body;

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-auto w-[min(100vw-2rem,24rem)] overflow-hidden rounded-2xl border border-outline-variant/25 bg-surface-container-lowest shadow-elevated"
    >
      <div className="flex gap-3 p-4">
        <div className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl teal-gradient text-on-primary shadow-primary-glow">
          <Zap className="h-5 w-5 fill-current" />
          <span className="absolute inset-0 rounded-2xl border border-on-primary/20" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-sm font-bold text-on-surface truncate">{step.heading}</p>
            <span
              className="inline-flex items-center gap-1 shrink-0 text-[10px] font-mono font-semibold tabular-nums text-primary"
              title="Elapsed time"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
              {formatElapsed(elapsedSec)}
            </span>
          </div>
          <p className="mt-1 text-xs leading-relaxed text-on-surface-variant">
            {bodyText}
          </p>
          <p className="mt-2 text-xs font-medium text-primary">{step.cta}</p>

          <div className="mt-3 flex flex-wrap gap-2">
            {QUICK_LINKS.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                onClick={() => toast.dismiss(SCAN_STARTED_TOAST_ID)}
                className="inline-flex items-center gap-1 rounded-full border border-outline-variant/40 bg-surface-container-low px-2.5 py-1 text-[11px] font-semibold text-on-surface-variant transition-colors hover:border-primary/30 hover:bg-primary/5 hover:text-primary"
              >
                <Icon className="h-3 w-3" />
                {label}
              </Link>
            ))}
          </div>
        </div>

        <button
          type="button"
          onClick={() => toast.dismiss(SCAN_STARTED_TOAST_ID)}
          className="shrink-0 rounded-lg p-1 text-on-surface-variant transition-colors hover:bg-surface-container-low hover:text-on-surface"
          aria-label="Dismiss scan notice"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="relative h-1 overflow-hidden bg-primary/10">
        <div className="scan-started-shimmer absolute inset-y-0 w-1/3 rounded-r-full bg-primary/50" />
      </div>
    </div>
  );
}

/**
 * Show the scan-started card. Called once at scan start.
 * The ScanCard component handles its own progressive state.
 */
export function showScanStartedToast(options?: { onboarding?: boolean }) {
  const onboarding = options?.onboarding ?? false;
  toast.custom(() => <ScanCard onboarding={onboarding} />, {
    id: SCAN_STARTED_TOAST_ID,
    duration: Infinity,
    dismissible: true,
  });
}

/** Dismiss the scan card. Sonner unmounts ScanCard which clears its timers. */
export function dismissScanStartedToast() {
  toast.dismiss(SCAN_STARTED_TOAST_ID);
}
