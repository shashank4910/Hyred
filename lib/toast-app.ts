import { toast } from 'sonner';
import { SCAN_STARTED_TOAST_ID } from '@/lib/scan-toast-id';

/** Clear all Sonner toasts (e.g. on logout so loaders do not stick). */
export function dismissAllAppToasts(): void {
  toast.dismiss();
  toast.dismiss(SCAN_STARTED_TOAST_ID);
}
