'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ArrowRight, Sparkles, X } from 'lucide-react';

const STORAGE_KEY = 'hyred-dashboard-promo-dismissed';

export function DashboardPromoBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      setVisible(localStorage.getItem(STORAGE_KEY) !== '1');
    } catch {
      setVisible(true);
    }
  }, []);

  if (!visible) return null;

  function dismiss() {
    try {
      localStorage.setItem(STORAGE_KEY, '1');
    } catch {
      /* ignore */
    }
    setVisible(false);
  }

  return (
    <section className="mt-4">
      <div className="overflow-hidden rounded-[2.5rem] bg-surface-container-lowest p-1 shadow-card">
        <div className="flex flex-col items-center md:flex-row">
          <div className="relative flex h-48 w-full items-center justify-center teal-gradient md:h-auto md:w-1/3 md:min-h-[220px]">
            <Sparkles className="h-16 w-16 text-on-primary/30" />
          </div>
          <div className="relative flex-1 p-8 md:p-10">
            <button
              type="button"
              onClick={dismiss}
              className="absolute right-4 top-4 rounded-lg p-1.5 text-on-surface-variant transition-colors hover:bg-surface-container-low hover:text-on-surface"
              aria-label="Dismiss"
            >
              <X className="h-4 w-4" />
            </button>
            <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-secondary-container/30 px-4 py-1.5 text-label-md font-bold uppercase tracking-widest text-secondary">
              AI matching
            </div>
            <h3 className="mb-3 text-headline-lg font-bold text-on-surface">
              Hyred scores every job against your resume
            </h3>
            <p className="mb-4 max-w-xl text-body-lg leading-relaxed text-on-surface-variant">
              We scan job boards, explain why each role fits, and highlight skills you already
              have — so you spend time on applications that matter.
            </p>
            <Link
              href="/stats"
              className="inline-flex items-center gap-2 font-semibold text-primary transition-colors hover:text-primary-container"
            >
              View your stats
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
