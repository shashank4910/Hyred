'use client';

import { useEffect, useState, useCallback } from 'react';

const FOCUS_CLASS = 'hyred-preview-focus';

/** Subscribe to Fix Studio focus mode (hides app sidebar for more preview space). */
export function usePreviewFocusMode(): boolean {
  const [active, setActive] = useState(false);

  useEffect(() => {
    const read = () => setActive(document.documentElement.classList.contains(FOCUS_CLASS));
    read();
    const obs = new MutationObserver(read);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => obs.disconnect();
  }, []);

  return active;
}

/** Call from Fix Studio while mounted. */
export function useSetPreviewFocusMode(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;
    document.documentElement.classList.add(FOCUS_CLASS);
    return () => {
      document.documentElement.classList.remove(FOCUS_CLASS);
    };
  }, [enabled]);
}

export function exitPreviewFocusMode(): void {
  document.documentElement.classList.remove(FOCUS_CLASS);
}

export function togglePreviewFocusMode(): void {
  document.documentElement.classList.toggle(FOCUS_CLASS);
}

export function useTogglePreviewFocus(): () => void {
  return useCallback(() => {
    document.documentElement.classList.toggle(FOCUS_CLASS);
  }, []);
}
