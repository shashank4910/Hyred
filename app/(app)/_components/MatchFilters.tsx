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

  const fieldClass = 'input-on-lime';

  const scoreSelect = (
    <select
      value={minScore}
      onChange={(e) => setParam('min', e.target.value)}
      className={fieldClass}
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
      className={fieldClass}
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
          className={fieldClass}
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
        className={fieldClass}
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
        className={fieldClass}
        aria-label="Job freshness"
      >
        <option value="">Recent jobs only</option>
        <option value="1">Include older jobs</option>
      </select>
    </>
  );

  function clearFilters() {
    const params = new URLSearchParams();
    const status = sp.get('status');
    const q = sp.get('q');
    if (status) params.set('status', status);
    if (q) params.set('q', q);
    navigate(`/?${params.toString()}`, { replace: true });
  }

  const panelBody = (
    <div className="space-y-4">
      <label className="block text-sm font-semibold text-ink">
        Match score
        <span className="mt-1.5 block">{scoreSelect}</span>
      </label>
      <label className="block text-sm font-semibold text-ink">
        Sort
        <span className="mt-1.5 block">{sortSelect}</span>
      </label>
      <label className="block text-sm font-semibold text-ink">
        More
        <span className="mt-1.5 block space-y-2">{secondaryFilters}</span>
      </label>
      {usingDefaultMin ? (
        <p className="text-sm text-ink/80">
          Showing {DEFAULT_LIST_MIN_SCORE}+.{' '}
          <button type="button" className="font-bold underline" onClick={() => setParam('min', '0')}>
            Include lower scores
          </button>
        </p>
      ) : minScore === '0' ? (
        <p className="text-sm text-ink/80">Showing all match scores.</p>
      ) : null}
    </div>
  );

  return (
    <div className={isPending ? 'opacity-80' : undefined}>
      <button
        type="button"
        className="btn lg:hidden"
        onClick={() => setMobileOpen((o) => !o)}
        aria-expanded={mobileOpen}
      >
        <SlidersHorizontal className="h-4 w-4" />
        Filters
        {secondaryFilterCount > 0 ? (
          <span className="rounded-full bg-lime-brand px-1.5 py-0.5 text-label-md font-bold text-ink">
            {secondaryFilterCount}
          </span>
        ) : null}
      </button>

      {mobileOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-ink/40"
            aria-label="Close filters"
            onClick={() => setMobileOpen(false)}
          />
          <div className="absolute bottom-0 left-0 right-0 max-h-[80vh] overflow-y-auto rounded-t-3xl bg-lime-brand p-6 text-ink shadow-elevated animate-slide-up">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-bold">Filters</h2>
              <div className="flex gap-2">
                {hasFilters && (
                  <button type="button" onClick={clearFilters} className="rounded-full bg-white/80 px-3 py-1 text-sm font-semibold">
                    reset
                  </button>
                )}
                <button type="button" onClick={() => setMobileOpen(false)} className="rounded-full bg-white p-2" aria-label="Close">
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
            {panelBody}
          </div>
        </div>
      ) : null}

      <aside className="hidden w-[260px] shrink-0 animate-slide-up rounded-2xl bg-lime-brand p-6 text-ink shadow-glass lg:block">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-xl font-bold">Filters</h2>
          {hasFilters && (
            <button type="button" onClick={clearFilters} className="rounded-full bg-white/85 px-3 py-1 text-sm font-semibold text-ink">
              reset ×
            </button>
          )}
        </div>
        {panelBody}
      </aside>
    </div>
  );
}
