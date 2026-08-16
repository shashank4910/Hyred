'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Info, Loader2 } from 'lucide-react';
import type { ScoreWidenNotice } from '@/lib/types';
import { toast } from 'sonner';

export function AdaptiveScoreWidenBanner({
  notice,
}: {
  notice: ScoreWidenNotice;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [hidden, setHidden] = useState(false);

  if (hidden) return null;

  async function patch(body: Record<string, unknown>) {
    const res = await fetch('/api/profile', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Could not update profile');
  }

  function dismiss() {
    startTransition(async () => {
      try {
        await patch({ clear_score_widen_notice: true });
        setHidden(true);
        router.refresh();
      } catch (e) {
        toast.error((e as Error).message);
      }
    });
  }

  function restorePrevious() {
    startTransition(async () => {
      try {
        await patch({ restore_score_floor: true });
        setHidden(true);
        toast.success(`Match bar restored to ${notice.previous_min_score}+`);
        router.refresh();
      } catch (e) {
        toast.error((e as Error).message);
      }
    });
  }

  const prev = notice.previous_min_score;
  const applied = notice.applied_min_score;
  const atPrev = notice.matches_at_user_min;
  const total = notice.matches_after_widen;

  return (
    <section
      className="mb-5 rounded-2xl border border-primary/25 bg-primary/5 px-4 py-3 text-sm text-on-surface"
      role="status"
      aria-live="polite"
    >
      <div className="flex gap-3">
        <Info className="h-5 w-5 shrink-0 text-primary mt-0.5" aria-hidden />
        <div className="min-w-0 flex-1 space-y-2">
          <p className="font-semibold text-on-surface">We widened your match bar</p>
          <p className="text-on-surface-variant leading-relaxed">
            Only {atPrev} job{atPrev === 1 ? '' : 's'} met your {prev}+ setting after the last
            scan. We included roles scoring {applied}+ so you have {total} to review — some may be
            a stretch. You can raise the bar anytime on{' '}
            <a href="/onboarding" className="text-primary font-medium underline-offset-2 hover:underline">
              My Resume
            </a>
            .
          </p>
          <div className="flex flex-wrap gap-2 pt-1">
            <button
              type="button"
              className="btn btn-secondary text-xs"
              disabled={pending}
              onClick={restorePrevious}
            >
              {pending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                `Restore ${prev}+ bar`
              )}
            </button>
            <button
              type="button"
              className="btn text-xs"
              disabled={pending}
              onClick={dismiss}
            >
              Got it
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
