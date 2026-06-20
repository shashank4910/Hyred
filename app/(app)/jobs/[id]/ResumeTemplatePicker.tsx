'use client';

import { useState } from 'react';
import { Lock, Check } from 'lucide-react';
import { toast } from 'sonner';
import {
  DEFAULT_RESUME_TEMPLATE_ID,
  RESUME_TEMPLATES,
  type ResumeTemplateMeta,
} from '@/lib/resume-templates';

type Props = {
  selectedId: string;
  onSelect: (id: string) => void;
  isPremium?: boolean;
};

export function ResumeTemplatePicker({ selectedId, onSelect, isPremium = false }: Props) {
  const [expanded, setExpanded] = useState(false);

  function handlePick(template: ResumeTemplateMeta) {
    if (!template.available) {
      toast.message(`${template.name} is coming soon`);
      return;
    }
    if (template.tier === 'premium' && !isPremium) {
      toast.error('Premium template — upgrade to unlock');
      return;
    }
    onSelect(template.id);
  }

  const selected = RESUME_TEMPLATES.find((t) => t.id === selectedId);

  return (
    <div className="mt-3 border-t border-outline-variant pt-3">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between text-xs font-medium text-on-surface-variant hover:text-on-surface"
      >
        <span>
          Template: <span className="text-on-surface">{selected?.name ?? 'Classic Navy'}</span>
        </span>
        <span className="text-primary">{expanded ? 'Hide' : 'Choose template'}</span>
      </button>
      {expanded && (
        <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-2">
          {RESUME_TEMPLATES.map((t) => {
            const locked = t.tier === 'premium' && !isPremium;
            const inactive = !t.available || locked;
            const isSelected = selectedId === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => handlePick(t)}
                className={[
                  'relative rounded-xl border px-3 py-2.5 text-left transition-colors',
                  isSelected
                    ? 'border-primary bg-primary/10'
                    : 'border-outline-variant hover:border-primary/40 hover:bg-surface-container-low',
                  inactive ? 'opacity-75' : '',
                ].join(' ')}
              >
                <div className="flex items-start justify-between gap-1">
                  <span className="text-xs font-semibold text-on-surface leading-tight">{t.name}</span>
                  {isSelected && <Check className="h-3.5 w-3.5 text-primary shrink-0" />}
                  {locked && <Lock className="h-3.5 w-3.5 text-on-surface-variant shrink-0" />}
                </div>
                <p className="mt-1 text-[10px] text-on-surface-variant leading-snug">{t.blurb}</p>
                {t.tier === 'premium' && (
                  <span className="mt-1.5 inline-block rounded-full bg-secondary-container/40 px-1.5 py-0.5 text-[9px] font-bold uppercase text-secondary">
                    Premium
                  </span>
                )}
                {!t.available && (
                  <span className="mt-1.5 inline-block text-[9px] font-medium text-on-surface-variant/80">
                    Soon
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export { DEFAULT_RESUME_TEMPLATE_ID };
