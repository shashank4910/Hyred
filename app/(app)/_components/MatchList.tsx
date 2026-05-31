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

export function MatchList({ initialMatches, total, initialHasMore, showSource = false, highlightId }: Props) {
  const [matches, setMatches] = useState<MatchItem[]>(initialMatches);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [loading, setLoading] = useState(false);
  const sp = useSearchParams();
  const sentinelRef = useRef<HTMLDivElement>(null);
  const highlightRef = useRef<HTMLLIElement>(null);

  const scrollKey = `hyred_scroll_${sp.toString()}`;

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
      const res = await fetch(`/api/matches?${buildQuery(nextPage)}`, { cache: 'default' });
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

  // Save scroll on card click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const link = (e.target as HTMLElement).closest('a[href^="/jobs/"]');
      if (link) sessionStorage.setItem(scrollKey, String(window.scrollY));
    };
    document.addEventListener('click', handler, { capture: true });
    return () => document.removeEventListener('click', handler, { capture: true });
  }, [scrollKey]);

  // Restore scroll on mount
  useEffect(() => {
    const saved = sessionStorage.getItem(scrollKey);
    if (saved) {
      requestAnimationFrame(() => window.scrollTo(0, parseInt(saved, 10)));
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
      <ul className="grid grid-cols-1 gap-6">
        {matches.map((m) => {
          const isHL = m.id === highlightId;
          return (
            <li
              key={m.id}
              ref={isHL ? highlightRef : undefined}
              className={`transition-all duration-300 rounded-2xl ${isHL ? 'ring-2 ring-primary ring-offset-2' : ''}`}
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
