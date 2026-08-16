'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { SlidersHorizontal, X } from 'lucide-react';
import { DEFAULT_LIST_MIN_SCORE, SOURCE_LABELS } from '@/lib/ui';
import { useDashboardNav } from './DashboardNavContext';
import PremiumSelect from '@/app/_components/ui/PremiumSelect';

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
    expired === '1';

  const cityOptions =
    city && !cities.some((c) => c.toLowerCase() === city.toLowerCase())
      ? [city, ...cities]
      : cities;

  const scoreSelect = (
    <PremiumSelect
      variant="forest"
      value={minScore}
      onChange={(v) => setParam('min', v)}
      aria-label="Minimum match score"
      options={[
        { value: '', label: `Default (${DEFAULT_LIST_MIN_SCORE}+)` },
        { value: '0', label: 'All scores' },
        { value: '60', label: '60+' },
        { value: '75', label: '75+' },
        { value: '85', label: '85+' },
        { value: '90', label: '90+' },
      ]}
    />
  );

  const secondaryFilters = (
    <>
      {isAdmin && (
        <PremiumSelect
          variant="forest"
          value={source}
          onChange={(v) => setParam('source', v)}
          aria-label="Job source"
          options={[
            { value: '', label: 'All sources' },
            ...SOURCES.map((s) => ({ value: s, label: SOURCE_LABELS[s] ?? s })),
          ]}
        />
      )}

      <PremiumSelect
        variant="forest"
        value={locationValue}
        onChange={setLocation}
        aria-label="Filter by location"
        options={[
          { value: '', label: 'Any location' },
          { value: REMOTE_VALUE, label: 'Remote only' },
        ]}
        groups={
          cityOptions.length > 0
            ? [
                {
                  label: 'Cities in your matches',
                  options: cityOptions.map((c) => ({ value: c, label: c })),
                },
              ]
            : undefined
        }
      />

      <PremiumSelect
        variant="forest"
        value={expired === '1' ? '1' : ''}
        onChange={(v) => setParam('expired', v)}
        aria-label="Job freshness"
        options={[
          { value: '', label: 'Recent jobs only' },
          { value: '1', label: 'Include older jobs' },
        ]}
      />
    </>
  );

  function clearFilters() {
    const params = new URLSearchParams();
    const status = sp.get('status');
    const q = sp.get('q');
    if (status) params.set('status', status);
    if (q) params.set('q', q);
    const sort = sp.get('sort');
    if (sort) params.set('sort', sort);
    navigate(`/?${params.toString()}`, { replace: true });
  }

  const panelBody = (
    <div className="space-y-4">
      <label className="block text-sm font-semibold text-white">
        Match score
        <span className="mt-1.5 block">{scoreSelect}</span>
      </label>
      <label className="block text-sm font-semibold text-white">
        Location & freshness
        <span className="mt-1.5 flex flex-col gap-2">{secondaryFilters}</span>
      </label>
      {usingDefaultMin ? (
        <p className="text-sm text-white/80">
          Showing {DEFAULT_LIST_MIN_SCORE}+.{' '}
          <button type="button" className="font-bold underline" onClick={() => setParam('min', '0')}>
            Include lower scores
          </button>
        </p>
      ) : minScore === '0' ? (
        <p className="text-sm text-white/80">Showing all match scores.</p>
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
          <div className="absolute bottom-0 left-0 right-0 max-h-[80vh] overflow-y-auto rounded-t-3xl bg-primary p-6 text-white shadow-elevated animate-slide-up">
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

      <aside className="hidden w-[300px] shrink-0 animate-slide-up self-start rounded-[1.5rem] bg-primary p-7 text-white shadow-glass lg:block">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-xl font-bold text-white">Filters</h2>
          {hasFilters && (
            <button type="button" onClick={clearFilters} className="rounded-full bg-white/15 px-3 py-1 text-sm font-semibold text-white">
              reset ×
            </button>
          )}
        </div>
        {panelBody}
      </aside>
    </div>
  );
}
