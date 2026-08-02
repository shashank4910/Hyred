'use client';

import type { ReactNode } from 'react';

/** Side-by-side Original | Hyred — equal-height panes, scroll inside each. */
export function AtsResumeTwinPreview({
  original,
  hyred,
  originalLabel = 'Original',
  hyredLabel = 'Hyred layout',
  originalMeta,
  hyredMeta,
  hyredHeaderExtra,
  className = '',
}: {
  original: ReactNode;
  hyred: ReactNode;
  originalLabel?: string;
  hyredLabel?: string;
  originalMeta?: string;
  hyredMeta?: string;
  /** Template picker / actions under the Improved View title. */
  hyredHeaderExtra?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`grid gap-5 lg:grid-cols-2 lg:items-stretch ${className}`}>
      <div className="flex min-h-[560px] min-w-0 flex-col overflow-hidden rounded-2xl border border-outline-variant/40 bg-surface-container-lowest shadow-card lg:h-[min(78vh,820px)]">
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-outline-variant/25 px-4 py-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-text-muted">Your resume</p>
            <h3 className="text-sm font-bold text-on-surface">{originalLabel}</h3>
          </div>
          {originalMeta && <span className="max-w-[40%] truncate text-[10px] text-text-muted">{originalMeta}</span>}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto bg-[#dfe5ee] p-4 sm:p-5">{original}</div>
      </div>
      <div className="flex min-h-[560px] min-w-0 flex-col overflow-hidden rounded-2xl border border-primary/30 bg-surface-container-lowest shadow-card ring-1 ring-primary/10 lg:h-[min(78vh,820px)]">
        <div className="flex shrink-0 flex-col gap-2 border-b border-outline-variant/25 bg-primary/[0.06] px-4 py-3">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-primary">Improved view</p>
              <h3 className="text-sm font-bold text-on-surface">{hyredLabel}</h3>
            </div>
            {hyredMeta && (
              <span className="max-w-[45%] shrink-0 truncate text-right text-[10px] text-text-muted">
                {hyredMeta}
              </span>
            )}
          </div>
          {hyredHeaderExtra}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto bg-[#dfe5ee] p-4 sm:p-5">{hyred}</div>
      </div>
    </div>
  );
}
