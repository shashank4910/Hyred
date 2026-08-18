'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Check, SlidersHorizontal, X } from 'lucide-react';
import { DEFAULT_LIST_MIN_SCORE, SOURCE_LABELS } from '@/lib/ui';
import { FRESHNESS_TICKS, type FreshnessTickId } from '@/lib/match-stats';
import { useDashboardNav } from './DashboardNavContext';
import PremiumSelect from '@/app/_components/ui/PremiumSelect';
import './MatchFilters.css';

const SOURCES = ['remotive', 'remoteok', 'hn', 'arbeitnow', 'adzuna_in', 'himalayas', 'jsearch', 'jobspipe', 'jobdatalake', 'linkedin'];

const REMOTE_VALUE = '__remote__';

const FRESH_TICK_IDS = new Set<string>(FRESHNESS_TICKS.map((t) => t.id));

function parseFreshIds(raw: string): Set<FreshnessTickId> {
  const ids = new Set<FreshnessTickId>();
  for (const part of raw.split(',')) {
    const id = part.trim();
    if (FRESH_TICK_IDS.has(id)) ids.add(id as FreshnessTickId);
  }
  return ids;
}

function ScoreFloorSlider({
  value,
  onCommit,
}: {
  value: number;
  onCommit: (n: number) => void;
}) {
  const [live, setLive] = useState(value);
  useEffect(() => setLive(value), [value]);
  const pct = Math.min(100, Math.max(0, live));

  return (
    <div className="score-floor">
      <div className="score-floor__track-wrap">
        <div className="score-floor__fill" aria-hidden="true">
          <div className="score-floor__fill-bar" style={{ width: `${pct}%` }} />
        </div>
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={live}
          aria-label="Match score floor"
          aria-valuetext={`${live}+`}
          className="score-floor__range"
          onChange={(e) => setLive(Number(e.target.value))}
          onPointerUp={(e) => onCommit(Number((e.target as HTMLInputElement).value))}
          onKeyUp={(e) => onCommit(Number((e.currentTarget as HTMLInputElement).value))}
        />
        <span className="score-floor__bubble" style={{ left: `${pct}%` }}>
          {live}+
        </span>
      </div>
      <div className="score-floor__ends">
        <span>0</span>
        <span>100</span>
      </div>
    </div>
  );
}

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
  const freshIds = parseFreshIds(sp.get('fresh') ?? '');

  const locationValue = remote === '1' ? REMOTE_VALUE : city;
  const sliderValue = minScore === '' ? DEFAULT_LIST_MIN_SCORE : Number(minScore) || 0;
  const secondaryFilterCount =
    (isAdmin && source ? 1 : 0) +
    (locationValue ? 1 : 0) +
    (expired === '1' ? 1 : 0) +
    (freshIds.size > 0 ? 1 : 0) +
    (minScore ? 1 : 0);

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

  function commitScore(n: number) {
    setParam('min', String(Math.min(100, Math.max(0, Math.round(n)))));
  }

  function toggleFresh(id: FreshnessTickId) {
    const next = new Set(freshIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    const params = new URLSearchParams(sp.toString());
    const ordered = FRESHNESS_TICKS.map((t) => t.id).filter((tick) => next.has(tick));
    if (ordered.length) {
      params.set('fresh', ordered.join(','));
      params.delete('expired');
    } else {
      params.delete('fresh');
    }
    navigate(`/?${params.toString()}`, { replace: true });
  }

  const hasFilters =
    (isAdmin && source) ||
    minScore ||
    remote ||
    city ||
    expired === '1' ||
    freshIds.size > 0;

  const cityOptions =
    city && !cities.some((c) => c.toLowerCase() === city.toLowerCase())
      ? [city, ...cities]
      : cities;

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
    <div className="space-y-5">
      <div>
        <p className="text-sm font-semibold text-white">Match score floor</p>
        <div className="mt-2">
          <ScoreFloorSlider value={sliderValue} onCommit={commitScore} />
        </div>
      </div>

      <div>
        <p className="text-sm font-semibold text-white">Freshness</p>
        <div className="mt-2">
          {FRESHNESS_TICKS.map((tick) => {
            const on = freshIds.has(tick.id);
            return (
              <button
                key={tick.id}
                type="button"
                role="checkbox"
                aria-checked={on}
                className="fresh-tick"
                onClick={() => toggleFresh(tick.id)}
              >
                <span className="fresh-tick__box">
                  {on ? <Check className="h-3 w-3" strokeWidth={3} /> : null}
                </span>
                {tick.label}
              </button>
            );
          })}
        </div>
        <button
          type="button"
          onClick={() => {
            const params = new URLSearchParams(sp.toString());
            if (expired === '1') {
              params.delete('expired');
            } else {
              params.set('expired', '1');
              params.delete('fresh');
            }
            navigate(`/?${params.toString()}`, { replace: true });
          }}
          className="mt-1 text-left text-sm font-semibold text-white/80 underline decoration-white/40 underline-offset-2 hover:text-white"
        >
          {expired === '1' ? 'Hide older jobs' : 'Include older jobs'}
        </button>
      </div>

      <label className="block text-sm font-semibold text-white">
        Location
        <span className="mt-1.5 flex flex-col gap-1.5">
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
        </span>
      </label>
    </div>
  );

  return (
    <div className={`${isPending ? 'opacity-80' : ''} lg:h-full lg:w-[320px] lg:shrink-0`}>
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
          <div className="absolute bottom-0 left-0 right-0 max-h-[85vh] overflow-y-auto rounded-t-3xl bg-primary p-6 text-white shadow-elevated animate-slide-up">
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

      <aside className="hidden h-full w-full overflow-y-auto rounded-[1.5rem] bg-primary p-5 text-white shadow-glass lg:block">
        <div className="mb-4 flex items-center justify-between">
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
