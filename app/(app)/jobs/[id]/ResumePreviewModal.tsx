'use client';

import { useEffect, type ReactNode } from 'react';
import { X, Loader2 } from 'lucide-react';

type Props = {
  open: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  /** Navy-header PDF preview — same as downloaded file */
  pdfUrl?: string | null;
  pdfLoading?: boolean;
  /** Template layout mock (HTML) */
  visualPreview?: ReactNode;
  /** Fallback plain text (legacy) */
  text?: string;
};

export function ResumePreviewModal({
  open,
  onClose,
  title = 'Resume preview',
  subtitle,
  pdfUrl,
  pdfLoading = false,
  visualPreview,
  text = '',
}: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/50 backdrop-blur-[2px]"
        onClick={onClose}
        aria-label="Close preview"
      />
      <div className="relative z-10 flex max-h-[92vh] w-full max-w-4xl flex-col rounded-t-2xl sm:rounded-2xl border border-outline-variant bg-surface-container-lowest shadow-elevated">
        <div className="flex items-center justify-between gap-3 border-b border-outline-variant px-4 py-3">
          <div className="min-w-0">
            <h3 className="font-semibold text-on-surface truncate">{title}</h3>
            {subtitle && (
              <p className="text-xs text-on-surface-variant truncate mt-0.5">{subtitle}</p>
            )}
          </div>
          <button type="button" onClick={onClose} className="btn p-2 shrink-0" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 overflow-hidden min-h-[50vh] sm:min-h-[70vh] bg-slate-200/80">
          {pdfLoading ? (
            <div className="flex h-full min-h-[50vh] flex-col items-center justify-center gap-3 text-on-surface-variant">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm">Building PDF preview…</p>
            </div>
          ) : pdfUrl ? (
            <iframe
              title={title}
              src={pdfUrl}
              className="h-full min-h-[50vh] sm:min-h-[70vh] w-full border-0 bg-white"
            />
          ) : visualPreview ? (
            <div className="h-full overflow-y-auto p-4">{visualPreview}</div>
          ) : (
            <pre className="h-full overflow-y-auto whitespace-pre-wrap p-4 text-sm text-on-surface-variant font-sans leading-relaxed">
              {text}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}
