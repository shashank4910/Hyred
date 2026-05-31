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

export function showScanStartedToast(options?: { onboarding?: boolean }) {
  const onboarding = options?.onboarding ?? false;

  toast.custom(
    () => (
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
            <p className="text-sm font-bold text-on-surface">Scan started — we&apos;re on it</p>
            <p className="mt-1 text-xs leading-relaxed text-on-surface-variant">
              {onboarding
                ? 'Pulling roles matched to your new resume from job boards across the web.'
                : 'Fetching fresh roles from job boards and scoring them against your resume.'}
              {' '}
              This usually takes <span className="font-semibold text-on-surface">1–2 minutes</span>.
            </p>
            <p className="mt-2 text-xs font-medium text-primary">
              Feel free to keep browsing — we&apos;ll notify you when it&apos;s done.
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
    ),
    {
      id: SCAN_STARTED_TOAST_ID,
      duration: Infinity,
      dismissible: true,
    },
  );
}

export function dismissScanStartedToast() {
  toast.dismiss(SCAN_STARTED_TOAST_ID);
}
