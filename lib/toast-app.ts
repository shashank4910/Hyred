import { toast } from 'sonner';

/** Default auto-dismiss for success / info toasts (ms). */
export const TOAST_MS = {
  default: 3000,
  long: 6000,
  error: 5000,
} as const;

/** Reuse these ids so a new action replaces the previous toast instead of stacking. */
export const TOAST_IDS = {
  resumeAnalysis: 'toast-resume-analysis',
  profileSave: 'toast-profile-save',
  jobScan: 'toast-job-scan',
} as const;

export type ToastId = (typeof TOAST_IDS)[keyof typeof TOAST_IDS] | string | number;

/** Clear all Sonner toasts (e.g. on logout so loaders do not stick). */
export function dismissAllAppToasts(): void {
  toast.dismiss();
}

/** Show a loading toast; pair with `finishAppToast` so it always auto-closes. */
export function showAppToastLoading(message: string, id: ToastId): ToastId {
  toast.loading(message, { id });
  return id;
}

/** Replace a loading toast with a final state that will auto-dismiss. */
export function finishAppToast(
  id: ToastId,
  message: string,
  variant: 'success' | 'error' | 'warning' = 'success',
  duration?: number,
): void {
  const ms =
    duration ??
    (variant === 'error'
      ? TOAST_MS.error
      : variant === 'warning'
        ? TOAST_MS.long
        : TOAST_MS.default);
  toast[variant](message, { id, duration: ms });
}
