'use client';

import { useState, type ReactNode } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

type Props = {
  title: string;
  icon?: ReactNode;
  summary?: string;
  defaultOpen?: boolean;
  children: ReactNode;
  className?: string;
};

/** Collapsible card — closed by default to keep the job page scannable. */
export function CollapsibleCard({
  title,
  icon,
  summary,
  defaultOpen = false,
  children,
  className = '',
}: Props) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className={`glass-card overflow-hidden ${className}`.trim()}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-6 py-4 text-left hover:bg-surface-container-low/40 transition-colors"
        aria-expanded={open}
      >
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {icon}
          <div className="min-w-0">
            <span className="font-headline font-semibold text-on-background">{title}</span>
            {!open && summary && (
              <p className="mt-0.5 truncate text-xs text-on-surface-variant">{summary}</p>
            )}
          </div>
        </div>
        {open ? (
          <ChevronUp className="h-4 w-4 shrink-0 text-on-surface-variant" />
        ) : (
          <ChevronDown className="h-4 w-4 shrink-0 text-on-surface-variant" />
        )}
      </button>
      {open && <div className="border-t border-outline-variant/40 px-6 pb-6 pt-4">{children}</div>}
    </div>
  );
}
