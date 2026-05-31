'use client';

import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';

/**
 * Client-side back button that uses router.back() for instant navigation
 * (no full page reload / skeleton). Falls back to "/" if there's no history.
 */
export function BackToMatches({ matchId }: { matchId: string }) {
  const router = useRouter();

  function handleBack(e: React.MouseEvent) {
    e.preventDefault();
    // If there's browser history (user came from the dashboard), go back instantly
    if (window.history.length > 1) {
      router.back();
    } else {
      // No history (direct link) — navigate to dashboard with highlight
      router.push(`/?from=${matchId}`);
    }
  }

  return (
    <button
      onClick={handleBack}
      className="inline-flex items-center gap-1.5 text-sm text-on-surface-variant hover:text-primary transition-colors"
    >
      <ArrowLeft className="h-4 w-4" /> All matches
    </button>
  );
}
