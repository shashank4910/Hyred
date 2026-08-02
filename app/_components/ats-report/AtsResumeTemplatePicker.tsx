'use client';

import { Check } from 'lucide-react';
import {
  listSelectableResumeThemes,
  type ResumeTemplateId,
} from '@/lib/resume-template-theme';

/** Compact horizontal picker for Improved View header. */
export function AtsResumeTemplatePicker({
  selectedId,
  onSelect,
}: {
  selectedId: string;
  onSelect: (id: ResumeTemplateId) => void;
}) {
  const themes = listSelectableResumeThemes();

  return (
    <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-1.5">
      <span className="mr-0.5 hidden text-[10px] font-semibold uppercase tracking-wide text-text-muted sm:inline">
        Template
      </span>
      {themes.map((t) => {
        const selected = selectedId === t.id;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onSelect(t.id)}
            title={t.blurb}
            aria-pressed={selected}
            className={[
              'inline-flex max-w-[9.5rem] items-center gap-1 rounded-lg border px-2 py-1 text-left transition-colors',
              selected
                ? 'border-primary bg-primary/15 text-primary ring-1 ring-primary/25'
                : 'border-outline-variant/50 bg-surface-container-lowest text-on-surface hover:border-primary/40 hover:bg-primary/5',
            ].join(' ')}
          >
            {selected && <Check className="h-3 w-3 shrink-0" aria-hidden="true" />}
            <span className="truncate text-[10px] font-semibold leading-tight">{t.name}</span>
          </button>
        );
      })}
    </div>
  );
}
