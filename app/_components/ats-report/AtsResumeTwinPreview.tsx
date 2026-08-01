'use client';

import type { ReactNode } from 'react';

/**
 * Side-by-side Original | Hyred layout preview (Enhancv-style twin).
 * Narrow screens stack; wide screens show both panes.
 */
export function AtsResumeTwinPreview({
  original,
  hyred,
  originalLabel = 'Original',
  hyredLabel = 'Hyred layout',
  className = '',
}: {
  original: ReactNode;
  hyred: ReactNode;
  originalLabel?: string;
  hyredLabel?: string;
  className?: string;
}) {
  return (
    <div className={`grid gap-4 lg:grid-cols-2 ${className}`}>
      <div className="flex min-h-[420px] min-w-0 flex-col overflow-hidden rounded-[1.25rem] border border-outline-variant/50 bg-surface-container-lowest shadow-card">
        <div className="border-b border-outline-variant/30 px-4 py-3">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-text-muted">Your resume</p>
          <h3 className="text-sm font-bold text-on-surface">{originalLabel}</h3>
        </div>
        <div className="flex-1 overflow-y-auto bg-[#eef1f6] p-3 sm:p-4">{original}</div>
      </div>
      <div className="flex min-h-[420px] min-w-0 flex-col overflow-hidden rounded-[1.25rem] border border-primary/25 bg-surface-container-lowest shadow-card">
        <div className="border-b border-outline-variant/30 bg-primary/5 px-4 py-3">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-primary">Improved view</p>
          <h3 className="text-sm font-bold text-on-surface">{hyredLabel}</h3>
        </div>
        <div className="flex-1 overflow-y-auto bg-[#eef1f6] p-3 sm:p-4">{hyred}</div>
      </div>
    </div>
  );
}
