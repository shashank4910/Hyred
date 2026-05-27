'use client';

import { useState, useMemo } from 'react';
import { CheckCircle2, Circle, Search, Zap } from 'lucide-react';

type KeywordPickerProps = {
  keywords: string[];
  alreadyHave: string[];
  onSelectionChange: (selected: string[]) => void;
  selected: string[];
};

export function KeywordPicker({ keywords, alreadyHave, onSelectionChange, selected }: KeywordPickerProps) {
  const [search, setSearch] = useState('');
  const alreadySet = useMemo(() => new Set(alreadyHave.map(k => k.toLowerCase())), [alreadyHave]);

  const { available, existing } = useMemo(() => {
    const available: string[] = [];
    const existing: string[] = [];
    for (const kw of keywords) {
      if (alreadySet.has(kw.toLowerCase())) existing.push(kw);
      else available.push(kw);
    }
    return { available, existing };
  }, [keywords, alreadySet]);

  const filtered = useMemo(() => {
    if (!search.trim()) return { available, existing };
    const q = search.toLowerCase();
    return {
      available: available.filter(k => k.toLowerCase().includes(q)),
      existing: existing.filter(k => k.toLowerCase().includes(q)),
    };
  }, [available, existing, search]);

  function toggle(kw: string) {
    const next = selected.includes(kw) ? selected.filter(k => k !== kw) : [...selected, kw];
    onSelectionChange(next);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Zap className="h-4 w-4 text-amber" />
          <span className="text-body-sm font-medium text-ink">Keyword Picker</span>
          <span className="text-caption text-stone">({selected.length}/{available.length} selected)</span>
        </div>
        <div className="flex gap-3">
          <button onClick={() => onSelectionChange([...available])} className="text-caption text-sunset-orange hover:underline font-medium">Select all</button>
          <button onClick={() => onSelectionChange([])} className="text-caption text-stone hover:text-ink">Clear</button>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-shadow-tint" />
        <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Filter keywords..." className="input pl-8 py-1.5 text-caption" />
      </div>

      {filtered.available.length > 0 && (
        <div>
          <p className="text-caption text-stone uppercase tracking-wide mb-2">From JD ({filtered.available.length})</p>
          <div className="flex flex-wrap gap-1.5">
            {filtered.available.map((kw) => {
              const isSelected = selected.includes(kw);
              return (
                <button key={kw} onClick={() => toggle(kw)} className={`inline-flex items-center gap-1 rounded-badge px-2 py-[3px] text-caption font-medium transition-all ${isSelected ? 'bg-amber/15 text-ink border border-amber/40' : 'bg-pearl border border-faded-stone text-stone hover:border-ink hover:text-ink'}`}>
                  {isSelected ? <CheckCircle2 className="h-3 w-3 text-amber" /> : <Circle className="h-3 w-3" />}
                  {kw}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {filtered.existing.length > 0 && (
        <div>
          <p className="text-caption text-stone uppercase tracking-wide mb-2">Already in resume ({filtered.existing.length})</p>
          <div className="flex flex-wrap gap-1.5">
            {filtered.existing.map((kw) => (
              <span key={kw} className="inline-flex items-center gap-1 rounded-badge border border-faded-stone bg-off-white px-2 py-[3px] text-caption text-shadow-tint">
                <CheckCircle2 className="h-3 w-3 text-emerald-500" />{kw}
              </span>
            ))}
          </div>
        </div>
      )}

      {filtered.available.length === 0 && filtered.existing.length === 0 && (
        <p className="text-caption text-stone">No keywords match your search.</p>
      )}

      {selected.length > 0 && (
        <div className="flex items-center gap-2 text-caption text-amber bg-amber/5 border border-amber/20 rounded-btn px-3 py-2">
          <Zap className="h-3.5 w-3.5 shrink-0" />
          {selected.length} keyword{selected.length > 1 ? 's' : ''} will be woven into your resume naturally.
        </div>
      )}
    </div>
  );
}
