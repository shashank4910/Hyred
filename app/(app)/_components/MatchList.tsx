'use client';

import { useEffect, useLayoutEffect, useRef, useState, useCallback } from 'react';
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

/**
 * sessionStorage snapshot of the full list state, written when the user clicks
 * a job card. On back-navigation, MatchList rehydrates from this snapshot so
 * ALL infinite-scroll-loaded cards are present (not just the server's page 1)
 * — which is what makes scroll-restore + flash land on the exact clicked card.
 */
const SNAPSHOT_KEY = 'hyred_matchlist_snapshot';
const SNAPSHOT_TTL_MS = 10 * 60 * 1000; // 10 minutes

type Snapshot = {
  signature: string;
  matches: MatchItem[];
  page: number;
  hasMore: boolean;
  total: number;
  scrollY: number;
  clickedId: string;
  savedAt: number;
};

function readSnapshot(): Snapshot | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(SNAPSHOT_KEY);
    if (!raw) return null;
    const snap = JSON.parse(raw) as Snapshot;
    if (Date.now() - snap.savedAt > SNAPSHOT_TTL_MS) {
      sessionStorage.removeItem(SNAPSHOT_KEY);
      return null;
    }
    return snap;
  } catch {
    return null;
  }
}

// Run a layout effect on the client, but fall back to a no-op effect during
// SSR (avoids the "useLayoutEffect does nothing on the server" warning).
const useIsoLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

export function MatchList({ initialMatches, total, initialHasMore, showSource = false, highlightId }: Props) {
  const sp = useSearchParams();

  // Filter signature — a snapshot only restores for the SAME filters.
  const signature = [
    sp.get('status') ?? 'inbox',
    sp.get('sort') ?? 'score',
    sp.get('min') ?? '',
    sp.get('q') ?? '',
    sp.get('remote') ?? '',
    sp.get('bookmarked') ?? '',
    sp.get('source') ?? '',
  ].join('|');

  // IMPORTANT: initialize with the SERVER data so the client hydration render
  // matches the server HTML exactly (no hydration mismatch). We swap to the
  // snapshot in a layout effect below — before the browser paints.
  const [matches, setMatches] = useState<MatchItem[]>(initialMatches);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [loading, setLoading] = useState(false);
  const [flashId, setFlashId] = useState<string | null>(null);

  const sentinelRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const didInit = useRef(false);
  const hydratedFromSnapshot = useRef(false);
  // Live ref of state so the click handler can snapshot without re-binding.
  const stateRef = useRef({ matches, page, hasMore, total });
  stateRef.current = { matches, page, hasMore, total };

  const buildQuery = useCallback((pageNum: number) => {
    const params = new URLSearchParams();
    params.set('page', String(pageNum));
    params.set('status', sp.get('status') ?? 'inbox');
    params.set('sort', sp.get('sort') ?? 'score');
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
      setMatches((prev: MatchItem[]) => {
        const ids = new Set(prev.map((m: MatchItem) => m.id));
        return [...prev, ...newMatches.filter((m: MatchItem) => !ids.has(m.id))];
      });
      setPage(nextPage);
      setHasMore(data.hasMore ?? false);
    } catch { /* retry on next scroll */ }
    finally { setLoading(false); }
  }, [loading, hasMore, page, buildQuery]);

  // ── Hydrate from snapshot BEFORE paint (client only, no hydration mismatch) ──
  useIsoLayoutEffect(() => {
    if (didInit.current) return;
    didInit.current = true;

    const snap = readSnapshot();
    if (snap && snap.signature === signature && snap.clickedId) {
      hydratedFromSnapshot.current = true;
      setMatches(snap.matches);
      setPage(snap.page);
      setHasMore(snap.hasMore);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Restore scroll + flash the clicked card (after the snapshot is applied) ──
  useEffect(() => {
    // Run only on first mount.
    const snap = readSnapshot();
    const fromSnapshot = !!(snap && snap.signature === signature && snap.clickedId);
    const restoreId = fromSnapshot ? snap!.clickedId : highlightId;
    if (!restoreId) return;

    const targetScroll = fromSnapshot ? snap!.scrollY : null;

    // Consume the snapshot so a refresh / fresh nav won't re-trigger it.
    if (snap) sessionStorage.removeItem(SNAPSHOT_KEY);

    const restore = () => {
      const card = listRef.current?.querySelector<HTMLElement>(`[data-match-id="${restoreId}"]`);
      if (targetScroll != null) {
        window.scrollTo({ top: targetScroll, behavior: 'instant' as ScrollBehavior });
      }
      if (card) {
        const rect = card.getBoundingClientRect();
        const offscreen = rect.top < 64 || rect.bottom > window.innerHeight;
        if (offscreen) {
          card.scrollIntoView({ behavior: 'instant' as ScrollBehavior, block: 'center' });
        }
        setFlashId(restoreId);
        window.setTimeout(() => setFlashId(null), 2000);
      }
    };

    // Two rAFs so the snapshot-applied DOM is laid out before we scroll.
    const r = requestAnimationFrame(() => requestAnimationFrame(restore));
    return () => cancelAnimationFrame(r);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  // Save a full snapshot when the user clicks a job card (capture-phase so it
  // runs before navigation begins).
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const el = e.target as HTMLElement;
      // Ignore clicks on inner buttons (e.g. bookmark) — they preventDefault and
      // do NOT navigate, so they must not write a (stale) restore snapshot.
      if (el.closest('button')) return;
      const link = el.closest('a[href^="/jobs/"]');
      if (!link) return;
      const href = link.getAttribute('href') ?? '';
      const clickedId = href.replace('/jobs/', '').split('?')[0];
      const snap: Snapshot = {
        signature,
        matches: stateRef.current.matches.slice(0, 200),
        page: stateRef.current.page,
        hasMore: stateRef.current.hasMore,
        total: stateRef.current.total,
        scrollY: window.scrollY,
        clickedId,
        savedAt: Date.now(),
      };
      try {
        sessionStorage.setItem(SNAPSHOT_KEY, JSON.stringify(snap));
      } catch { /* storage full — ignore */ }
    };
    document.addEventListener('click', handler, { capture: true });
    return () => document.removeEventListener('click', handler, { capture: true });
  }, [signature]);

  // Reset when the server sends a different first page (filters changed).
  // Skip once if we just hydrated from a snapshot for the SAME signature.
  useEffect(() => {
    if (hydratedFromSnapshot.current) {
      hydratedFromSnapshot.current = false;
      return;
    }
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
        {matches.map((m: MatchItem) => (
          <li
            key={m.id}
            data-match-id={m.id}
            className={`rounded-2xl transition-shadow duration-500 ${
              flashId === m.id ? 'ring-2 ring-primary ring-offset-2 ring-offset-surface-container-lowest' : ''
            }`}
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
