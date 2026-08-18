'use client';

import { useEffect, useRef, useState, useCallback, useMemo, useLayoutEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { Loader2, ChevronDown } from 'lucide-react';
import { resolveMatchSort } from '@/lib/ui';
import { isJobPastFreshnessWindow } from '@/lib/match-stats';
import { captureMatchRects, playMatchFlip } from '@/lib/match-list-flip';
import { sortMatchesByFreshness } from '@/lib/job-listing-time';
import { MatchCard } from './MatchCard';
import { MatchSortBar } from './MatchSortBar';

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

export function MatchList({ initialMatches, total: initialTotal, initialHasMore, showSource = false, highlightId }: Props) {
  const [matches, setMatches] = useState<MatchItem[]>(initialMatches);
  const [total, setTotal] = useState(initialTotal);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const sp = useSearchParams();
  const sentinelRef = useRef<HTMLDivElement>(null);
  const highlightRef = useRef<HTMLLIElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const pendingFlip = useRef<Map<string, DOMRect> | null>(null);
  const seenFilterKey = useRef<string | null>(null);

  const scrollKey = `hyred_scroll_${sp.toString()}`;

  // The desktop dashboard scrolls the job list column (#dashboard-list-scroll),
  // not the window — so scroll save/restore must target that container first.
  function listScrollEl(): HTMLElement | null {
    return document.getElementById('dashboard-list-scroll');
  }

  const buildQuery = useCallback((pageNum: number) => {
    const params = new URLSearchParams();
    params.set('page', String(pageNum));
    params.set('status', sp.get('status') ?? 'inbox');
    params.set('sort', resolveMatchSort(sp.get('sort')));
    if (sp.get('min')) params.set('min', sp.get('min')!);
    if (sp.get('q')) params.set('q', sp.get('q')!);
    if (sp.get('remote')) params.set('remote', sp.get('remote')!);
    if (sp.get('city')) params.set('city', sp.get('city')!);
    if (sp.get('bookmarked')) params.set('bookmarked', sp.get('bookmarked')!);
    if (sp.get('source')) params.set('source', sp.get('source')!);
    if (sp.get('expired') === '1') params.set('expired', '1');
    if (sp.get('fresh')) params.set('fresh', sp.get('fresh')!);
    return params.toString();
  }, [sp]);

  const filterKey = useMemo(() => buildQuery(1), [buildQuery]);
  const showExpired = sp.get('expired') === '1';
  const sortMode = resolveMatchSort(sp.get('sort'));

  function orderLoaded(list: MatchItem[]): MatchItem[] {
    return sortMode === 'posted' ? sortMatchesByFreshness(list) : list;
  }

  const loadMore = useCallback(async () => {
    if (loading || refreshing || !hasMore) return;
    setLoading(true);
    try {
      const nextPage = page + 1;
      const res = await fetch(`/api/matches?${buildQuery(nextPage)}`, { cache: 'default' });
      if (!res.ok) throw new Error('Failed');
      const data = await res.json();
      const newMatches = (data.matches ?? []) as MatchItem[];
      setMatches((prev) => {
        const ids = new Set(prev.map((m) => m.id));
        return orderLoaded([...prev, ...newMatches.filter((m) => !ids.has(m.id))]);
      });
      setPage(nextPage);
      setHasMore(data.hasMore ?? false);
      if (typeof data.total === 'number') setTotal(data.total);
    } catch { /* retry on next scroll */ }
    finally { setLoading(false); }
  }, [loading, refreshing, hasMore, page, buildQuery, sortMode]);

  // Filter/sort/status change: hit the lightweight API immediately (do not wait
  // for the full dashboard RSC round-trip — that was the perceived lag).
  useEffect(() => {
    if (seenFilterKey.current === null) {
      seenFilterKey.current = filterKey;
      return;
    }
    if (seenFilterKey.current === filterKey) return;
    seenFilterKey.current = filterKey;

    const controller = new AbortController();
    setRefreshing(true);
    setPage(1);

    fetch(`/api/matches?${filterKey}`, { signal: controller.signal, cache: 'default' })
      .then((res) => {
        if (!res.ok) throw new Error('Failed');
        return res.json();
      })
      .then((data) => {
        pendingFlip.current = captureMatchRects(listRef.current);
        setMatches(orderLoaded((data.matches ?? []) as MatchItem[]));
        setHasMore(Boolean(data.hasMore));
        setTotal(typeof data.total === 'number' ? data.total : 0);
        setPage(1);
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
      })
      .finally(() => {
        if (!controller.signal.aborted) setRefreshing(false);
      });

    return () => controller.abort();
  }, [filterKey]);

  // When SSR catches up with the same filters, adopt its payload (skills, etc.).
  const skipSsrFlip = useRef(true);
  useEffect(() => {
    if (skipSsrFlip.current) {
      skipSsrFlip.current = false;
      setMatches(orderLoaded(initialMatches));
      setTotal(initialTotal);
      setPage(1);
      setHasMore(initialHasMore);
      setRefreshing(false);
      return;
    }
    pendingFlip.current = captureMatchRects(listRef.current);
    setMatches(orderLoaded(initialMatches));
    setTotal(initialTotal);
    setPage(1);
    setHasMore(initialHasMore);
    setRefreshing(false);
  }, [initialMatches, initialHasMore, initialTotal]);

  useLayoutEffect(() => {
    playMatchFlip(listRef.current, pendingFlip.current);
    pendingFlip.current = null;
  }, [matches]);

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

  // Save scroll on card click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const link = (e.target as HTMLElement).closest('a[href^="/jobs/"]');
      if (link) {
        const scroller = listScrollEl();
        sessionStorage.setItem(scrollKey, String(scroller ? scroller.scrollTop : window.scrollY));
      }
    };
    document.addEventListener('click', handler, { capture: true });
    return () => document.removeEventListener('click', handler, { capture: true });
  }, [scrollKey]);

  // Restore scroll on mount
  useEffect(() => {
    const saved = sessionStorage.getItem(scrollKey);
    if (saved) {
      requestAnimationFrame(() => {
        const scroller = listScrollEl();
        const y = parseInt(saved, 10);
        if (scroller) scroller.scrollTop = y;
        else window.scrollTo(0, y);
      });
      sessionStorage.removeItem(scrollKey);
    }
  }, [scrollKey]);

  // Highlight card on back-navigation
  useEffect(() => {
    if (highlightId && highlightRef.current) {
      highlightRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
      highlightRef.current.classList.add('ring-2', 'ring-primary', 'ring-offset-2');
      const t = setTimeout(() => {
        highlightRef.current?.classList.remove('ring-2', 'ring-primary', 'ring-offset-2');
      }, 1500);
      return () => clearTimeout(t);
    }
  }, [highlightId]);

  if (matches.length === 0) {
    return (
      <div>
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-text-muted">Showing 0 of {total}</p>
          <MatchSortBar />
        </div>
        {refreshing ? (
          <div className="flex items-center gap-2 py-8 text-sm text-on-surface-variant">
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
            Updating matches…
          </div>
        ) : (
          <p className="py-8 text-sm text-on-surface-variant">
            No matches for these filters. Try another city or lower the score filter.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className={refreshing ? 'opacity-80 transition-opacity duration-150' : undefined}>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-text-muted flex items-center gap-2">
          <span>
            Showing {matches.length} of {total}
          </span>
          {refreshing && (
            <span className="inline-flex items-center gap-1 text-primary">
              <Loader2 className="h-3 w-3 animate-spin" />
              Updating…
            </span>
          )}
        </p>
        <MatchSortBar />
      </div>
      <ul ref={listRef} className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
        {matches.map((m, i) => {
          const isHL = m.id === highlightId;
          return (
            <li
              key={m.id}
              data-match-id={m.id}
              ref={isHL ? highlightRef : undefined}
              className={`h-full ${isHL ? 'ring-2 ring-primary ring-offset-2 rounded-2xl' : ''}`}
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
                createdAt={m.created_at}
                showSource={showSource}
                isOlder={showExpired && isJobPastFreshnessWindow(m.job)}
                staggerIndex={i}
              />
            </li>
          );
        })}
      </ul>

      <div ref={sentinelRef} className="h-1" />

      {loading && (
        <div className="flex items-center justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
          <span className="ml-2 text-sm text-text-muted">Loading more…</span>
        </div>
      )}

      {hasMore && !loading && !refreshing && (
        <div className="flex justify-center py-4">
          <button onClick={loadMore} className="btn text-xs inline-flex items-center gap-1.5">
            <ChevronDown className="h-3.5 w-3.5" /> Load more ({total - matches.length} remaining)
          </button>
        </div>
      )}

      {!hasMore && matches.length >= 20 && (
        <p className="text-center text-xs text-text-muted py-4">All {total} matches loaded</p>
      )}
    </div>
  );
}
