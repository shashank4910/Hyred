'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Search, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { SOURCE_LABELS } from '@/lib/ui';

const SOURCES = ['remotive', 'remoteok', 'hn', 'arbeitnow', 'adzuna_in'];

export function MatchFilters() {
  const router = useRouter();
  const sp = useSearchParams();
  const [q, setQ] = useState(sp.get('q') ?? '');
  const source = sp.get('source') ?? '';
  const minScore = sp.get('min') ?? '';
  const remote = sp.get('remote') ?? '';

  // Debounced search
  useEffect(() => {
    const id = setTimeout(() => {
      const params = new URLSearchParams(sp.toString());
      if (q) params.set('q', q);
      else params.delete('q');
      router.replace(`/?${params.toString()}`, { scroll: false });
    }, 300);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  function setParam(name: string, value: string) {
    const params = new URLSearchParams(sp.toString());
    if (value) params.set(name, value);
    else params.delete(name);
    router.replace(`/?${params.toString()}`, { scroll: false });
  }

  const hasFilters = q || source || minScore || remote;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative flex-1 min-w-[200px] max-w-md">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-shadow-tint" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search title, company, skills..."
          className="input pl-9"
        />
      </div>

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

      {hasFilters && (
        <button
          onClick={() => {
            setQ('');
            const params = new URLSearchParams();
            const status = sp.get('status');
            if (status) params.set('status', status);
            router.replace(`/?${params.toString()}`, { scroll: false });
          }}
          className="btn-ghost"
        >
          <X className="h-3.5 w-3.5" />
          Clear
        </button>
      )}
    </div>
  );
}
