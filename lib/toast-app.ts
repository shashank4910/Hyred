import { toast } from 'sonner';

/** Clear all Sonner toasts (e.g. on logout so loaders do not stick). */
export function dismissAllAppToasts(): void {
  toast.dismiss();
}
