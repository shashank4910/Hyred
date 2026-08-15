'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { SlidersHorizontal, X } from 'lucide-react';
import { DEFAULT_LIST_MIN_SCORE, DEFAULT_MATCH_SORT, SOURCE_LABELS, resolveMatchSort } from '@/lib/ui';
import { useDashboardNav } from './DashboardNavContext';

const SOURCES = ['remotive', 'remoteok', 'hn', 'arbeitnow', 'adzuna_in', 'himalayas', 'jsearch', 'jobspipe', 'jobdatalake', 'linkedin'];

const REMOTE_VALUE = '__remote__';

export function MatchFilters({
  isAdmin = false,
  cities = [],
}: {
  isAdmin?: boolean;
  cities?: string[];
}) {
  const sp = useSearchParams();
  const { navigate, isPending } = useDashboardNav();
  const [mobileOpen, setMobileOpen] = useState(false);
  const source = sp.get('source') ?? '';
  const minScore = sp.get('min') ?? '';
  const remote = sp.get('remote') ?? '';
  const city = sp.get('city') ?? '';
  const expired = sp.get('expired') ?? '';
  const sortParam = sp.get('sort');
  const sort = resolveMatchSort(sortParam);

  const locationValue = remote === '1' ? REMOTE_VALUE : city;
  const usingDefaultMin = minScore === '';
  const secondaryFilterCount =
    (isAdmin && source ? 1 : 0) +
    (locationValue ? 1 : 0) +
    (expired === '1' ? 1 : 0);

  function setParam(name: string, value: string) {
    const params = new URLSearchParams(sp.toString());
    if (value) params.set(name, value);
    else params.delete(name);
    navigate(`/?${params.toString()}`, { replace: true });
  }

  function setLocation(value: string) {
    const params = new URLSearchParams(sp.toString());
    if (value === REMOTE_VALUE) {
      params.set('remote', '1');
      params.delete('city');
    } else if (value) {
      params.set('city', value);
      params.delete('remote');
    } else {
      params.delete('city');
      params.delete('remote');
    }
    navigate(`/?${params.toString()}`, { replace: true });
  }

  const hasFilters =
    (isAdmin && source) ||
    minScore ||
    remote ||
    city ||
    expired === '1' ||
    (sortParam != null && sortParam !== '' && sort !== DEFAULT_MATCH_SORT);

  const cityOptions =
    city && !cities.some((c) => c.toLowerCase() === city.toLowerCase())
      ? [city, ...cities]
      : cities;

  const scoreSelect = (
    <select
      value={minScore}
      onChange={(e) => setParam('min', e.target.value)}
      className="input w-auto"
      aria-label="Minimum match score"
    >
      <option value="">{`Default (${DEFAULT_LIST_MIN_SCORE}+)`}</option>
      <option value="0">All scores</option>
      <option value="60">60+</option>
      <option value="75">75+</option>
      <option value="85">85+</option>
      <option value="90">90+</option>
    </select>
  );

  const sortSelect = (
    <select
      value={sort}
      onChange={(e) =>
        setParam('sort', e.target.value === DEFAULT_MATCH_SORT ? '' : e.target.value)
      }
      className="input w-auto"
      aria-label="Sort matches"
    >
      <option value="score">Best score</option>
      <option value="newest">Newest first</option>
      <option value="activity">Recent activity</option>
    </select>
  );

  const secondaryFilters = (
    <>
      {isAdmin && (
        <select
          value={source}
          onChange={(e) => setParam('source', e.target.value)}
          className="input w-auto"
          aria-label="Job source"
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
        value={locationValue}
        onChange={(e) => setLocation(e.target.value)}
        className="input w-auto max-w-[14rem]"
        aria-label="Filter by location"
      >
        <option value="">Any location</option>
        <option value={REMOTE_VALUE}>Remote only</option>
        {cityOptions.length > 0 && (
          <optgroup label="Cities in your matches">
            {cityOptions.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </optgroup>
        )}
      </select>

      <select
        value={expired === '1' ? '1' : ''}
        onChange={(e) => setParam('expired', e.target.value)}
        className="input w-auto"
        aria-label="Job freshness"
      >
        <option value="">Recent jobs only</option>
        <option value="1">Include older jobs</option>
      </select>
    </>
  );

  return (
    <div className={`relative z-0 space-y-2 ${isPending ? 'opacity-70' : ''}`}>
      <div className="flex flex-wrap items-center gap-2">
        {scoreSelect}
        {sortSelect}

        <button
          type="button"
          className="btn md:hidden"
          onClick={() => setMobileOpen((o) => !o)}
          aria-expanded={mobileOpen}
        >
          <SlidersHorizontal className="h-4 w-4" />
          Filters
          {secondaryFilterCount > 0 ? (
            <span className="rounded-full bg-primary/15 px-1.5 py-0.5 text-label-md font-bold text-primary">
              {secondaryFilterCount}
            </span>
          ) : null}
        </button>

        <div className="hidden flex-wrap items-center gap-2 md:flex">{secondaryFilters}</div>

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

      {mobileOpen ? (
        <div className="flex flex-wrap items-center gap-2 border-t border-outline-variant/30 pt-2 md:hidden">
          {secondaryFilters}
        </div>
      ) : null}

      {usingDefaultMin ? (
        <p className="text-label-md text-text-muted">
          Showing matches scored {DEFAULT_LIST_MIN_SCORE}+.{' '}
          <button
            type="button"
            className="font-semibold text-primary hover:underline"
            onClick={() => setParam('min', '0')}
          >
            Include lower scores
          </button>
        </p>
      ) : minScore === '0' ? (
        <p className="text-label-md text-text-muted">Showing all match scores.</p>
      ) : null}
    </div>
  );
}
