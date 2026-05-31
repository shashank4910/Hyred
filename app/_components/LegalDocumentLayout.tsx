import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { LegalFooterLinks } from './LegalFooterLinks';

export function LegalDocumentLayout({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-off-white">
      <header className="border-b border-border-muted bg-surface/80 backdrop-blur-md">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <Link
            href="/login"
            className="inline-flex items-center gap-1.5 text-sm text-stone hover:text-ink"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </Link>
          <span className="font-semibold text-ink">Hyred</span>
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-8 pb-16">
        <h1 className="text-heading-sm font-semibold text-ink mb-2">{title}</h1>
        <article className="legal-prose">{children}</article>
        <div className="mt-10 pt-6 border-t border-border-muted">
          <LegalFooterLinks />
        </div>
      </main>
    </div>
  );
}
