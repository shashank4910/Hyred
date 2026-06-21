'use client';

import { useEffect, type ReactNode } from 'react';
import { X, Pencil, Save } from 'lucide-react';

export type ResumePreviewModalKind = 'current' | 'version' | 'template';

type Props = {
  open: boolean;
  onClose: () => void;
  title?: string;
  /** Plain-text preview (current resume or saved version) */
  text?: string;
  mode?: 'preview' | 'edit';
  onModeChange?: (mode: 'preview' | 'edit') => void;
  editedText?: string;
  onEditedTextChange?: (text: string) => void;
  onSave?: () => void;
  allowEdit?: boolean;
  /** Styled template sample — when set, shown instead of plain text */
  visualPreview?: ReactNode;
  subtitle?: string;
};

export function ResumePreviewModal({
  open,
  onClose,
  title = 'Resume preview',
  text = '',
  mode = 'preview',
  onModeChange,
  editedText = '',
  onEditedTextChange,
  onSave,
  allowEdit = true,
  visualPreview,
  subtitle,
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

  const showEdit = allowEdit && !visualPreview && onModeChange && onEditedTextChange && onSave;

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
      <div className="relative z-10 flex max-h-[92vh] w-full max-w-3xl flex-col rounded-t-2xl sm:rounded-2xl border border-outline-variant bg-surface-container-lowest shadow-elevated">
        <div className="flex items-center justify-between gap-3 border-b border-outline-variant px-4 py-3">
          <div className="min-w-0">
            <h3 className="font-semibold text-on-surface truncate">{title}</h3>
            {subtitle && (
              <p className="text-xs text-on-surface-variant truncate mt-0.5">{subtitle}</p>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {showEdit && (
              <>
                <button
                  type="button"
                  onClick={() => onModeChange!('preview')}
                  className={
                    mode === 'preview'
                      ? 'text-xs font-medium text-primary border-b border-primary pb-0.5'
                      : 'text-xs text-on-surface-variant hover:text-on-surface'
                  }
                >
                  Preview
                </button>
                <button
                  type="button"
                  onClick={() => onModeChange!('edit')}
                  className={
                    mode === 'edit'
                      ? 'text-xs font-medium text-primary border-b border-primary pb-0.5'
                      : 'text-xs text-on-surface-variant hover:text-on-surface'
                  }
                >
                  <Pencil className="h-3 w-3 inline mr-0.5" />
                  Edit
                </button>
                {mode === 'edit' && (
                  <button type="button" onClick={onSave} className="btn-primary text-xs py-1.5 px-2.5">
                    <Save className="h-3 w-3" />
                    Save
                  </button>
                )}
              </>
            )}
            <button type="button" onClick={onClose} className="btn p-2" aria-label="Close">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-4 bg-surface-container-low/30">
          {visualPreview ? (
            visualPreview
          ) : mode === 'edit' && showEdit ? (
            <textarea
              value={editedText}
              onChange={(e) => onEditedTextChange!(e.target.value)}
              className="input min-h-[60vh] w-full font-mono text-sm leading-relaxed resize-y bg-surface-container-lowest"
            />
          ) : (
            <pre className="whitespace-pre-wrap text-sm text-on-surface-variant font-sans leading-relaxed bg-surface-container-lowest rounded-xl border border-outline-variant p-4">
              {text}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}
