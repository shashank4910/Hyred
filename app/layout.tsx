import type { Metadata } from 'next';
import { Toaster } from 'sonner';
import './globals.css';

export const metadata: Metadata = {
  title: 'JobRadar',
  description: 'AI-curated job matches from across the web.',
  robots: 'noindex, nofollow',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="light">
      <body className="min-h-screen bg-background text-on-surface font-sans antialiased">
        {children}
        <Toaster
          theme="light"
          position="top-right"
          toastOptions={{
            style: {
              background: '#ffffff',
              color: '#121c2a',
              border: '1px solid #E5E7EB',
              boxShadow: '0 4px 6px -1px rgba(18, 28, 42, 0.06)',
              borderRadius: '0.75rem',
            },
          }}
        />
      </body>
    </html>
  );
}
