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
          color: '#111c2d',
          border: '1px solid #bbcac7',
          boxShadow: '0px 8px 32px rgba(0, 106, 101, 0.06)',
          borderRadius: '1rem',
          fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
        },
      }}
    />
  );
}
