'use client';

import { useEffect } from 'react';

/** Scroll to #apply, #ats-resume, or #referral when landing from Match Intelligence CTAs. */
export function JobHashScroll() {
  useEffect(() => {
    const hash = window.location.hash.slice(1);
    if (!hash) return;

    if (hash === 'referral') {
      window.dispatchEvent(new CustomEvent('hyred:expand-referral'));
    }

    const timer = window.setTimeout(() => {
      document.getElementById(hash)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, hash === 'referral' ? 200 : 50);

    return () => clearTimeout(timer);
  }, []);

  return null;
}
