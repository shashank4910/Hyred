'use client';

import { useSearchParams } from 'next/navigation';
import { X } from 'lucide-react';
import { DEFAULT_MATCH_SORT, SOURCE_LABELS, resolveMatchSort } from '@/lib/ui';
import { useDashboardNav } from './DashboardNavContext';

const SOURCES = ['remotive', 'remoteok', 'hn', 'arbeitnow', 'adzuna_in', 'himalayas', 'jsearch', 'linkedin'];

export function MatchFilters({ isAdmin = false }: { isAdmin?: boolean }) {
  const sp = useSearchParams();
  const { navigate, isPending } = useDashboardNav();
  const source = sp.get('source') ?? '';
  const minScore = sp.get('min') ?? '';
  const remote = sp.get('remote') ?? '';
  const sortParam = sp.get('sort');
  const sort = resolveMatchSort(sortParam);

  function setParam(name: string, value: string) {
    const params = new URLSearchParams(sp.toString());
    if (value) params.set(name, value);
    else params.delete(name);
    navigate(`/?${params.toString()}`, { replace: true });
  }

  const hasFilters =
    (isAdmin && source) ||
    minScore ||
    remote ||
    (sortParam != null && sortParam !== '' && sort !== DEFAULT_MATCH_SORT);

  return (
    <div className={`relative z-0 flex flex-wrap items-center gap-2 ${isPending ? 'opacity-70' : ''}`}>
      {isAdmin && (
        <select
          value={source}
          onChange={(e) => setParam('source', e.target.value)}
          className="input w-auto"
        >
          <option value="">All sources</option>
          {SOURCES.map((s) => (
            <option key={s} value={s}>
              {SOURCE_LABELS[s] ?? s}
            </option>
          ))}
        </select>
      )}

      <select
        value={minScore}
        onChange={(e) => setParam('min', e.target.value)}
        className="input w-auto"
      >
        <option value="">Any score</option>
        <option value="60">60+</option>
        <option value="75">75+</option>
        <option value="85">85+</option>
        <option value="90">90+</option>
      </select>

      <select
        value={remote}
        onChange={(e) => setParam('remote', e.target.value)}
        className="input w-auto"
      >
        <option value="">Any location</option>
        <option value="1">Remote only</option>
      </select>

      <select
        value={sort}
        onChange={(e) =>
          setParam('sort', e.target.value === DEFAULT_MATCH_SORT ? '' : e.target.value)
        }
        className="input w-auto"
        title="Sort matches"
      >
        <option value="score">Best score</option>
        <option value="newest">Newest first</option>
        <option value="activity">Recent activity</option>
      </select>

      {hasFilters && (
        <button
          type="button"
          onClick={() => {
            const params = new URLSearchParams();
            const status = sp.get('status');
            const q = sp.get('q');
            if (status) params.set('status', status);
            if (q) params.set('q', q);
            navigate(`/?${params.toString()}`, { replace: true });
          }}
          className="btn-ghost text-error"
        >
          <X className="h-3.5 w-3.5" />
          Clear filters
        </button>
      )}
    </div>
  );
}
