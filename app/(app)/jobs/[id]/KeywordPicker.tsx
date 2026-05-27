'use client';

import { useState, useMemo } from 'react';
import { CheckCircle2, Circle, Search, Zap } from 'lucide-react';

type KeywordPickerProps = {
  keywords: string[];
  alreadyHave: string[];
  onSelectionChange: (selected: string[]) => void;
  selected: string[];
};

export function KeywordPicker({
  keywords,
  alreadyHave,
  onSelectionChange,
  selected,
}: KeywordPickerProps) {
  const [search, setSearch] = useState('');

  const alreadySet = useMemo(() => new Set(alreadyHave.map(k => k.toLowerCase())), [alreadyHave]);

  const { available, existing } = useMemo(() => {
    const available: string[] = [];
    const existing: string[] = [];
    for (const kw of keywords) {
      if (alreadySet.has(kw.toLowerCase())) {
        existing.push(kw);
      } else {
        available.push(kw);
      }
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
    const next = selected.includes(kw)
      ? selected.filter(k => k !== kw)
      : [...selected, kw];
    onSelectionChange(next);
  }

  function selectAll() {
    onSelectionChange([...available]);
  }

  function selectNone() {
    onSelectionChange([]);
  }

  const selectedCount = selected.length;
  const totalAvailable = available.length;

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Zap className="h-4 w-4 text-amber" />
          <span className="text-sm font-medium text-ink">Keyword Picker</span>
          <span className="text-xs text-stone">
            ({selectedCount}/{totalAvailable} selected)
          </span>
        </div>
        <div className="flex gap-2">
          <button onClick={selectAll} className="text-xs text-amber-hover hover:underline font-medium">
            Select all
          </button>
          <span className="text-stone text-xs">|</span>
          <button onClick={selectNone} className="text-xs text-stone hover:text-ink">
            Clear
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-shadow-tint" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Filter keywords..."
          className="input pl-8 py-1.5 text-xs"
        />
      </div>


      {/* Available keywords to add */}
      {filtered.available.length > 0 && (
        <div>
          <div className="text-[10px] uppercase tracking-wide text-amber-hover mb-1.5 font-medium">
            Add to your resume ({filtered.available.length} from JD)
          </div>
          <div className="flex flex-wrap gap-1.5">
            {filtered.available.map((kw) => {
              const isSelected = selected.includes(kw);
              return (
                <button
                  key={kw}
                  onClick={() => toggle(kw)}
                  className={`
                    inline-flex items-center gap-1 rounded-badge px-2.5 py-1 text-xs font-medium
                    transition-all duration-150 cursor-pointer
                    ${isSelected
                      ? 'bg-amber/15 text-ink border border-amber/40 shadow-sm'
                      : 'bg-pearl border border-border text-stone hover:border-amber/30 hover:text-ink'
                    }
                  `}
                >
                  {isSelected ? (
                    <CheckCircle2 className="h-3 w-3 text-amber" />
                  ) : (
                    <Circle className="h-3 w-3" />
                  )}
                  {kw}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Already in resume */}
      {filtered.existing.length > 0 && (
        <div>
          <div className="text-[10px] uppercase tracking-wide text-stone mb-1.5">
            Already in your resume ({filtered.existing.length})
          </div>
          <div className="flex flex-wrap gap-1.5">
            {filtered.existing.map((kw) => (
              <span
                key={kw}
                className="inline-flex items-center gap-1 rounded-badge border border-faded-stone bg-off-white px-2.5 py-1 text-xs text-shadow-tint"
              >
                <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                {kw}
              </span>
            ))}
          </div>
        </div>
      )}

      {filtered.available.length === 0 && filtered.existing.length === 0 && (
        <p className="text-xs text-stone py-2">No keywords match your search.</p>
      )}

      {/* Helper text */}
      {selectedCount > 0 && (
        <div className="flex items-center gap-1.5 text-xs text-amber-hover bg-amber/5 border border-amber/20 rounded-btn px-3 py-2">
          <Zap className="h-3.5 w-3.5 shrink-0" />
          <span>
            {selectedCount} keyword{selectedCount > 1 ? 's' : ''} will be woven into your resume naturally (without fabricating experience).
          </span>
        </div>
      )}
    </div>
  );
}
