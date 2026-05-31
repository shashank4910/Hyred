'use client';

import Link from 'next/link';
import { toast } from 'sonner';
import { BarChart3, FileText, Sparkles, X, Zap } from 'lucide-react';

import { SCAN_STARTED_TOAST_ID } from '@/lib/scan-toast-id';

const QUICK_LINKS = [
  { href: '/stats', label: 'Stats', icon: BarChart3 },
  { href: '/onboarding', label: 'My Resume', icon: FileText },
  { href: '/?status=inbox', label: 'Matches', icon: Sparkles },
] as const;

/**
 * Progressive scan status messages. The toast card re-renders at each
 * interval showing updated copy so the user always knows what's happening.
 */
const PROGRESS_STEPS = [
  {
    delay: 0,
    heading: 'Scan started \u2014 we\u2019re on it',
    body: 'Fetching fresh roles from job boards and scoring them against your resume. This usually takes',
    time: '1\u20135 minutes',
    hint: 'depending on your roles, locations, and how many sources we scan.',
    cta: 'Feel free to keep browsing \u2014 we\u2019ll notify you when it\u2019s done.',
  },
  {
    delay: 30_000,
    heading: 'Still working on it...',
    body: 'Filtering through hundreds of listings to find ones worth scoring. Your personalized matches are being prepared.',
    time: null,
    hint: null,
    cta: 'This is normal \u2014 we\u2019re being thorough so you don\u2019t miss anything.',
  },
  {
    delay: 90_000,
    heading: 'AI is scoring your matches',
    body: 'Each potential job is being individually analyzed against your resume \u2014 checking skills, experience level, and location fit.',
    time: null,
    hint: null,
    cta: 'Almost there! Results will appear on your dashboard automatically.',
  },
  {
    delay: 180_000,
    heading: 'Hang tight \u2014 lots of matches!',
    body: 'Looks like there are quite a few potential matches this time. The AI is being thorough with each one so your scores are accurate.',
    time: null,
    hint: null,
    cta: 'Your results are coming \u2014 we haven\u2019t forgotten about you!',
  },
  {
    delay: 270_000,
    heading: 'Final stretch',
    body: 'This is taking a bit longer than usual \u2014 likely because your profile matches many roles across multiple sources.',
    time: null,
    hint: null,
    cta: 'Your matches will appear any moment now. Thanks for your patience!',
  },
];

/** Active progress timers — module-level so they survive re-renders */
let progressTimers: ReturnType<typeof setTimeout>[] = [];

function renderToastCard(step: typeof PROGRESS_STEPS[number], onboarding: boolean) {
  const bodyText = onboarding && step.delay === 0
    ? 'Pulling roles matched to your new resume from job boards across the web. This usually takes'
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
          <p className="text-sm font-bold text-on-surface">{step.heading}</p>
          <p className="mt-1 text-xs leading-relaxed text-on-surface-variant">
            {bodyText}
            {step.time && (
              <>
                {' '}<span className="font-semibold text-on-surface">{step.time}</span>
              </>
            )}
            {step.hint && <> {step.hint}</>}
          </p>
          <p className="mt-2 text-xs font-medium text-primary">
            {step.cta}
          </p>

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

function showStep(step: typeof PROGRESS_STEPS[number], onboarding: boolean) {
  toast.custom(() => renderToastCard(step, onboarding), {
    id: SCAN_STARTED_TOAST_ID,
    duration: Infinity,
    dismissible: true,
  });
}

export function showScanStartedToast(options?: { onboarding?: boolean }) {
  const onboarding = options?.onboarding ?? false;

  // Clear any previous timers
  progressTimers.forEach(clearTimeout);
  progressTimers = [];

  // Show each progressive step at its delay
  for (const step of PROGRESS_STEPS) {
    const timer = setTimeout(() => showStep(step, onboarding), step.delay);
    progressTimers.push(timer);
  }
}

export function dismissScanStartedToast() {
  progressTimers.forEach(clearTimeout);
  progressTimers = [];
  toast.dismiss(SCAN_STARTED_TOAST_ID);
}
