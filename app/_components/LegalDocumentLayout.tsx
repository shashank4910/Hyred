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
    <div className="min-h-screen">
      <header className="border-b border-outline-variant bg-surface/80 backdrop-blur-md">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <Link
            href="/login"
            className="inline-flex items-center gap-1.5 text-sm text-on-surface-variant hover:text-on-surface"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </Link>
          <span className="font-semibold text-on-surface">Hyred</span>
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-8 pb-16">
        <h1 className="text-heading-sm font-semibold text-on-surface mb-2">{title}</h1>
        <article className="legal-prose">{children}</article>
        <div className="mt-10 pt-6 border-t border-outline-variant">
          <LegalFooterLinks />
        </div>
      </main>
    </div>
  );
}
