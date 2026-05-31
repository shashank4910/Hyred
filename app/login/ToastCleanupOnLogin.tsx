'use client';

import { useEffect } from 'react';
import { dismissAllAppToasts } from '@/lib/toast-app';

/** Clear any toasts left over from logout or in-flight scans. */
export function ToastCleanupOnLogin() {
  useEffect(() => {
    dismissAllAppToasts();
  }, []);

  return null;
}
