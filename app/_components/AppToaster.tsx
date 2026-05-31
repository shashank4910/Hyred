'use client';

import { Toaster } from 'sonner';

/** Bottom-right toasts so they do not cover header actions (Run scan, Sign out). */
export function AppToaster() {
  return (
    <Toaster
      theme="light"
      position="bottom-right"
      closeButton
      offset={16}
      mobileOffset={{ bottom: 88, right: 16, left: 16 }}
      toastOptions={{
        duration: 8000,
        style: {
          background: '#ffffff',
          color: '#121c2a',
          border: '1px solid #E5E7EB',
          boxShadow: '0 4px 6px -1px rgba(18, 28, 42, 0.06)',
          borderRadius: '0.75rem',
        },
      }}
    />
  );
}
