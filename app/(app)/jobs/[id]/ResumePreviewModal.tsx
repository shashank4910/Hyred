'use client';

import { useEffect, type ReactNode } from 'react';
import {
  X,
  Loader2,
  ChevronLeft,
  ChevronRight,
  LayoutTemplate,
  Sparkles,
  FileText,
} from 'lucide-react';
import type { ResumeTemplateMeta } from '@/lib/resume-templates';
import { RESUME_TEMPLATES } from '@/lib/resume-templates';

export type ResumePreviewKind = 'resume' | 'template';

type Props = {
  open: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  kind?: ResumePreviewKind;
  templateMeta?: ResumeTemplateMeta;
  templateId?: string;
  onTemplateNavigate?: (id: string) => void;
  /** Navy-header PDF preview — same as downloaded file */
  pdfUrl?: string | null;
  pdfLoading?: boolean;
  /** Template layout mock (HTML) */
  visualPreview?: ReactNode;
  /** Fallback plain text (legacy) */
  text?: string;
};

function PreviewPaper({
  children,
  loading,
}: {
  children?: ReactNode;
  loading?: boolean;
}) {
  return (
    <div className="flex min-h-full w-full items-center justify-center p-5 sm:p-8 md:p-10">
      <div
        className="relative w-full max-w-[540px] shrink-0"
        style={{ aspectRatio: '210 / 297' }}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute -inset-3 rounded-sm bg-black/25 blur-2xl"
        />
        <div
          className={[
            'relative flex h-full w-full flex-col overflow-hidden rounded-[3px] bg-white',
            'ring-1 ring-black/10',
            'shadow-[0_1px_1px_rgba(15,23,42,0.06),0_12px_32px_rgba(15,23,42,0.18),0_32px_64px_rgba(15,23,42,0.22)]',
          ].join(' ')}
        >
          {loading ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 bg-slate-50 text-on-surface-variant">
              <Loader2 className="h-7 w-7 animate-spin text-primary" />
              <p className="text-sm font-medium">Rendering preview…</p>
            </div>
          ) : (
            children
          )}
        </div>
      </div>
    </div>
  );
}

function TierBadge({ tier }: { tier: ResumeTemplateMeta['tier'] }) {
  if (tier === 'premium') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-secondary-container/60 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-secondary">
        <Sparkles className="h-3 w-3" />
        Pro
      </span>
    );
  }
  return (
    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary">
      Free
    </span>
  );
}

export function ResumePreviewModal({
  open,
  onClose,
  title = 'Resume preview',
  subtitle,
  kind = 'resume',
  templateMeta,
  templateId,
  onTemplateNavigate,
  pdfUrl,
  pdfLoading = false,
  visualPreview,
  text = '',
}: Props) {
  const isTemplate = kind === 'template';
  const templateIndex = templateId
    ? RESUME_TEMPLATES.findIndex((t) => t.id === templateId)
    : -1;
  const canNavigate =
    isTemplate && onTemplateNavigate && templateIndex >= 0 && RESUME_TEMPLATES.length > 1;
  const prevTemplate = canNavigate
    ? RESUME_TEMPLATES[(templateIndex - 1 + RESUME_TEMPLATES.length) % RESUME_TEMPLATES.length]
    : null;
  const nextTemplate = canNavigate
    ? RESUME_TEMPLATES[(templateIndex + 1) % RESUME_TEMPLATES.length]
    : null;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (!canNavigate || !onTemplateNavigate) return;
      if (e.key === 'ArrowLeft' && prevTemplate) onTemplateNavigate(prevTemplate.id);
      if (e.key === 'ArrowRight' && nextTemplate) onTemplateNavigate(nextTemplate.id);
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose, canNavigate, onTemplateNavigate, prevTemplate, nextTemplate]);

  if (!open) return null;

  const showPaperFrame = isTemplate || Boolean(pdfUrl);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <button
        type="button"
        className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm"
        onClick={onClose}
        aria-label="Close preview"
      />
      <div
        className={[
          'relative z-10 flex max-h-[94vh] w-full flex-col overflow-hidden',
          'rounded-t-2xl sm:rounded-2xl border border-outline-variant/80',
          'bg-surface-container-lowest shadow-[0_24px_80px_rgba(15,23,42,0.35)]',
          isTemplate ? 'max-w-5xl' : 'max-w-4xl',
        ].join(' ')}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-outline-variant bg-surface-container-low px-4 py-3 sm:px-5">
          <div className="flex min-w-0 items-start gap-3">
            <div
              className={[
                'mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl',
                isTemplate ? 'bg-primary/10 text-primary' : 'bg-surface-container text-on-surface-variant',
              ].join(' ')}
            >
              {isTemplate ? (
                <LayoutTemplate className="h-4 w-4" />
              ) : (
                <FileText className="h-4 w-4" />
              )}
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="truncate font-semibold text-on-surface">{title}</h3>
                {isTemplate && templateMeta && (
                  <>
                    <TierBadge tier={templateMeta.tier} />
                    {templateMeta.available ? (
                      <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                        Live preview
                      </span>
                    ) : (
                      <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
                        Layout sample
                      </span>
                    )}
                  </>
                )}
              </div>
              {subtitle && (
                <p className="mt-0.5 text-xs leading-relaxed text-on-surface-variant line-clamp-2">
                  {subtitle}
                </p>
              )}
              {isTemplate && (
                <p className="mt-1.5 text-[11px] text-on-surface-variant/90">
                  Sample content shown — your optimized resume exports in this layout.
                </p>
              )}
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1">
            {canNavigate && prevTemplate && nextTemplate && (
              <div className="mr-1 hidden items-center gap-0.5 sm:flex">
                <button
                  type="button"
                  onClick={() => onTemplateNavigate!(prevTemplate.id)}
                  className="btn p-2 text-on-surface-variant hover:text-on-surface"
                  aria-label={`Previous template: ${prevTemplate.name}`}
                  title={prevTemplate.name}
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="min-w-[3.5rem] text-center text-[10px] font-medium tabular-nums text-on-surface-variant">
                  {templateIndex + 1}/{RESUME_TEMPLATES.length}
                </span>
                <button
                  type="button"
                  onClick={() => onTemplateNavigate!(nextTemplate.id)}
                  className="btn p-2 text-on-surface-variant hover:text-on-surface"
                  aria-label={`Next template: ${nextTemplate.name}`}
                  title={nextTemplate.name}
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            )}
            <button
              type="button"
              onClick={onClose}
              className="btn rounded-xl border border-outline-variant bg-surface-container-lowest p-2 hover:bg-surface-container"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Canvas */}
        <div
          className={[
            'flex-1 overflow-auto min-h-[52vh] sm:min-h-[68vh]',
            showPaperFrame
              ? 'bg-[#0f1419] [background-image:radial-gradient(rgba(255,255,255,0.07)_1px,transparent_1px)] [background-size:18px_18px]'
              : 'bg-slate-100',
          ].join(' ')}
        >
          {pdfLoading ? (
            <PreviewPaper loading />
          ) : pdfUrl && showPaperFrame ? (
            <PreviewPaper>
              <iframe title={title} src={pdfUrl} className="h-full w-full border-0 bg-white" />
            </PreviewPaper>
          ) : pdfUrl ? (
            <iframe
              title={title}
              src={pdfUrl}
              className="h-full min-h-[52vh] sm:min-h-[68vh] w-full border-0 bg-white"
            />
          ) : visualPreview ? (
            <PreviewPaper>{visualPreview}</PreviewPaper>
          ) : (
            <pre className="h-full overflow-y-auto whitespace-pre-wrap p-5 text-sm leading-relaxed text-on-surface-variant font-sans">
              {text}
            </pre>
          )}
        </div>

        {isTemplate && canNavigate && prevTemplate && nextTemplate && (
          <div className="flex items-center justify-between gap-3 border-t border-outline-variant bg-surface-container-low px-4 py-2.5 sm:hidden">
            <button
              type="button"
              onClick={() => onTemplateNavigate!(prevTemplate.id)}
              className="btn flex items-center gap-1 px-2 py-1.5 text-xs"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              {prevTemplate.name}
            </button>
            <span className="text-[10px] font-medium text-on-surface-variant">
              {templateIndex + 1}/{RESUME_TEMPLATES.length}
            </span>
            <button
              type="button"
              onClick={() => onTemplateNavigate!(nextTemplate.id)}
              className="btn flex items-center gap-1 px-2 py-1.5 text-xs"
            >
              {nextTemplate.name}
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {isTemplate && (
          <div className="border-t border-outline-variant bg-surface-container-lowest px-4 py-2.5 sm:px-5">
            <p className="text-center text-[11px] text-on-surface-variant">
              Tip: use arrow keys to browse templates · Esc to close
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
