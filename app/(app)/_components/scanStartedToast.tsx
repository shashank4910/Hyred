'use client';

import { SCAN_STARTED_TOAST_ID } from '@/lib/scan-toast-id';
import { setScanUiActive } from '@/lib/scan-ui-active';
import { toast } from 'sonner';

/**
 * Start the live scan HUD (bottom-right). Does not cover the page.
 * Called once when a scan begins.
 */
export function showScanStartedToast(options?: { onboarding?: boolean }) {
  void options;
  setScanUiActive(true);
  toast.dismiss(SCAN_STARTED_TOAST_ID);
}

export function dismissScanStartedToast() {
  setScanUiActive(false);
  toast.dismiss(SCAN_STARTED_TOAST_ID);
}
