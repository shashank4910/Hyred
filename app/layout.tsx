import type { Metadata } from 'next';
import { SpeedInsights } from '@vercel/speed-insights/next';
import { AppToaster } from './_components/AppToaster';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'Hyred', template: '%s · Hyred' },
  description: 'AI that matches you to the right jobs and tailors your resume to get you Hyred.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="light">
      <body className="min-h-screen bg-background text-on-surface font-sans antialiased">
        {children}
        <AppToaster />
        <SpeedInsights />
      </body>
    </html>
  );
}
