'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { Loader2, ChevronDown } from 'lucide-react';
import { MatchCard } from './MatchCard';

type MatchJob = {
  id: string;
  title: string;
  company: string | null;
  location: string | null;
  remote: boolean;
  url: string;
  source: string;
  salary: string | null;
  posted_at: string | null;
  fetched_at: string | null;
};

type MatchItem = {
  id: string;
  llm_score: number | null;
  similarity: number | null;
  reason: string | null;
  status: string;
  bookmarked: boolean;
  matched_skills: string[] | null;
  missing_skills: string[] | null;
  applied_at: string | null;
  created_at: string;
  updated_at: string;
  job: MatchJob;
};

type Props = {
  initialMatches: MatchItem[];
  total: number;
  initialHasMore: boolean;
  showSource?: boolean;
  highlightId?: string | null;
};

const SCROLL_KEY = 'hyred_dashboard_scroll';
const LAST_CLICKED_KEY = 'hyred_last_clicked_match';

export function MatchList({ initialMatches, total, initialHasMore, showSource = false, highlightId }: Props) {
  const [matches, setMatches] = useState<MatchItem[]>(initialMatches);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [loading, setLoading] = useState(false);
  const [flashId, setFlashId] = useState<string | null>(null);
  const sp = useSearchParams();
  const sentinelRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const didRestore = useRef(false);

  // Determine which card to highlight: from URL param or sessionStorage
  const targetHighlightId = highlightId || (typeof window !== 'undefined' ? sessionStorage.getItem(LAST_CLICKED_KEY) : null);

  const buildQuery = useCallback((pageNum: number) => {
    const params = new URLSearchParams();
    params.set('page', String(pageNum));
    params.set('status', sp.get('status') ?? 'inbox');
    if (sp.get('sort')) params.set('sort', sp.get('sort')!);
    else params.set('sort', 'score');
    if (sp.get('min')) params.set('min', sp.get('min')!);
    if (sp.get('q')) params.set('q', sp.get('q')!);
    if (sp.get('remote')) params.set('remote', sp.get('remote')!);
    if (sp.get('bookmarked')) params.set('bookmarked', sp.get('bookmarked')!);
    if (sp.get('source')) params.set('source', sp.get('source')!);
    return params.toString();
  }, [sp]);

  const loadMore = useCallback(async () => {
    if (loading || !hasMore) return;
    setLoading(true);
    try {
      const nextPage = page + 1;
      const res = await fetch(`/api/matches?${buildQuery(nextPage)}`);
      if (!res.ok) throw new Error('Failed');
      const data = await res.json();
      const newMatches = (data.matches ?? []) as MatchItem[];
      setMatches((prev) => {
        const ids = new Set(prev.map((m) => m.id));
        return [...prev, ...newMatches.filter((m) => !ids.has(m.id))];
      });
      setPage(nextPage);
      setHasMore(data.hasMore ?? false);
    } catch { /* retry on next scroll */ }
    finally { setLoading(false); }
  }, [loading, hasMore, page, buildQuery]);

  // Infinite scroll observer
  useEffect(() => {
    if (!sentinelRef.current) return;
    const obs = new IntersectionObserver(
      (entries) => { if (entries[0]?.isIntersecting) loadMore(); },
      { rootMargin: '400px' },
    );
    obs.observe(sentinelRef.current);
    return () => obs.disconnect();
  }, [loadMore]);

  // Save scroll position + clicked match ID when user clicks a card
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const link = (e.target as HTMLElement).closest('a[href^="/jobs/"]');
      if (link) {
        // Extract match ID from the href: /jobs/{matchId}
        const href = link.getAttribute('href') ?? '';
        const matchId = href.replace('/jobs/', '');
        sessionStorage.setItem(SCROLL_KEY, String(window.scrollY));
        sessionStorage.setItem(LAST_CLICKED_KEY, matchId);
      }
    };
    document.addEventListener('click', handler, { capture: true });
    return () => document.removeEventListener('click', handler, { capture: true });
  }, []);

  // Scroll restore + highlight on mount (runs ONCE)
  useEffect(() => {
    if (didRestore.current) return;
    didRestore.current = true;

    const savedScroll = sessionStorage.getItem(SCROLL_KEY);
    const savedMatchId = sessionStorage.getItem(LAST_CLICKED_KEY);

    if (savedScroll && savedMatchId) {
      // Clear immediately so it doesn't fire again on next mount
      sessionStorage.removeItem(SCROLL_KEY);
      sessionStorage.removeItem(LAST_CLICKED_KEY);

      // Wait for DOM to be fully painted, then restore scroll + flash
      setTimeout(() => {
        // Restore scroll position
        window.scrollTo({ top: parseInt(savedScroll, 10), behavior: 'instant' });

        // Find the card and flash it
        setTimeout(() => {
          const card = listRef.current?.querySelector(`[data-match-id="${savedMatchId}"]`);
          if (card) {
            // Scroll into view in case position restoration wasn't perfect
            card.scrollIntoView({ behavior: 'smooth', block: 'center' });
            // Flash highlight
            card.classList.add('ring-2', 'ring-primary', 'ring-offset-2', 'ring-offset-surface-container-lowest');
            setFlashId(savedMatchId);
            setTimeout(() => {
              card.classList.remove('ring-2', 'ring-primary', 'ring-offset-2', 'ring-offset-surface-container-lowest');
              setFlashId(null);
            }, 2000);
          }
        }, 150);
      }, 80);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reset on filter change
  useEffect(() => {
    setMatches(initialMatches);
    setPage(1);
    setHasMore(initialHasMore);
  }, [initialMatches, initialHasMore]);

  if (matches.length === 0) return null;

  return (
    <>
      <p className="text-xs text-text-muted mb-2">
        Showing {matches.length} of {total}
      </p>
      <ul ref={listRef} className="grid grid-cols-1 gap-6">
        {matches.map((m) => (
          <li
            key={m.id}
            data-match-id={m.id}
            className={`transition-all duration-500 rounded-2xl ${flashId === m.id ? 'ring-2 ring-primary ring-offset-2' : ''}`}
          >
            <MatchCard
              matchId={m.id}
              score={m.llm_score}
              reason={m.reason}
              status={m.status}
              bookmarked={m.bookmarked ?? false}
              matchedSkills={m.matched_skills ?? []}
              missingSkills={m.missing_skills ?? []}
              job={m.job as unknown as MatchJob}
              showSource={showSource}
            />
          </li>
        ))}
      </ul>

      <div ref={sentinelRef} className="h-1" />

      {loading && (
        <div className="flex items-center justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
          <span className="ml-2 text-sm text-text-muted">Loading more…</span>
        </div>
      )}

      {hasMore && !loading && (
        <div className="flex justify-center py-4">
          <button onClick={loadMore} className="btn text-xs inline-flex items-center gap-1.5">
            <ChevronDown className="h-3.5 w-3.5" /> Load more ({total - matches.length} remaining)
          </button>
        </div>
      )}

      {!hasMore && matches.length >= 20 && (
        <p className="text-center text-xs text-text-muted py-4">All {total} matches loaded</p>
      )}
    </>
  );
}
