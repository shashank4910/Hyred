'use client';

import { Lock, Check, LayoutTemplate } from 'lucide-react';
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
    <div className="mb-4 rounded-2xl border border-primary/25 bg-primary/5 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <LayoutTemplate className="h-4 w-4 text-primary shrink-0" />
          <div>
            <p className="text-sm font-semibold text-on-surface">PDF template</p>
            <p className="text-xs text-on-surface-variant">
              Selected: <span className="font-medium text-primary">{selected?.name ?? 'Classic Navy'}</span>
            </p>
          </div>
        </div>
        <span className="rounded-full bg-surface-container-lowest border border-outline-variant px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-on-surface-variant">
          Tap to switch
        </span>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 snap-x snap-mandatory">
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
                'snap-start shrink-0 w-[132px] rounded-xl border px-3 py-2.5 text-left transition-all',
                isSelected
                  ? 'border-primary bg-primary/15 ring-2 ring-primary/30 shadow-sm'
                  : 'border-outline-variant bg-surface-container-lowest hover:border-primary/50 hover:bg-surface-container-low',
                inactive ? 'opacity-80' : '',
              ].join(' ')}
            >
              <div className="flex items-start justify-between gap-1 mb-1">
                <span className="text-xs font-bold text-on-surface leading-tight line-clamp-2">{t.name}</span>
                {isSelected && <Check className="h-3.5 w-3.5 text-primary shrink-0" />}
                {locked && !isSelected && <Lock className="h-3.5 w-3.5 text-on-surface-variant shrink-0" />}
              </div>
              <p className="text-[10px] text-on-surface-variant leading-snug line-clamp-2">{t.blurb}</p>
              <div className="mt-2 flex flex-wrap gap-1">
                {t.tier === 'premium' && (
                  <span className="rounded-full bg-secondary-container/50 px-1.5 py-0.5 text-[8px] font-bold uppercase text-secondary">
                    Pro
                  </span>
                )}
                {!t.available && (
                  <span className="text-[8px] font-semibold text-on-surface-variant">Soon</span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export { DEFAULT_RESUME_TEMPLATE_ID };
