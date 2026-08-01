'use client';

import type { ReactNode } from 'react';

/** Side-by-side Original | Hyred layout — mockup twin. */
export function AtsResumeTwinPreview({
  original,
  hyred,
  originalLabel = 'Original',
  hyredLabel = 'Hyred layout',
  originalMeta,
  hyredMeta,
  className = '',
}: {
  original: ReactNode;
  hyred: ReactNode;
  originalLabel?: string;
  hyredLabel?: string;
  originalMeta?: string;
  hyredMeta?: string;
  className?: string;
}) {
  return (
    <div className={`grid gap-4 lg:grid-cols-2 ${className}`}>
      <div className="flex min-h-[480px] min-w-0 flex-col overflow-hidden rounded-2xl border border-outline-variant/40 bg-surface-container-lowest shadow-card">
        <div className="flex items-center justify-between gap-2 border-b border-outline-variant/25 px-4 py-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-text-muted">Your resume</p>
            <h3 className="text-sm font-bold text-on-surface">{originalLabel}</h3>
          </div>
          {originalMeta && <span className="truncate text-[10px] text-text-muted">{originalMeta}</span>}
        </div>
        <div className="flex-1 overflow-y-auto bg-[#e8ecf2] p-3 sm:p-4">{original}</div>
      </div>
      <div className="flex min-h-[480px] min-w-0 flex-col overflow-hidden rounded-2xl border border-primary/30 bg-surface-container-lowest shadow-card ring-1 ring-primary/10">
        <div className="flex items-center justify-between gap-2 border-b border-outline-variant/25 bg-primary/[0.06] px-4 py-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-primary">Improved view</p>
            <h3 className="text-sm font-bold text-on-surface">{hyredLabel}</h3>
          </div>
          {hyredMeta && <span className="truncate text-[10px] text-text-muted">{hyredMeta}</span>}
        </div>
        <div className="flex-1 overflow-y-auto bg-[#e8ecf2] p-3 sm:p-4">{hyred}</div>
      </div>
    </div>
  );
}
