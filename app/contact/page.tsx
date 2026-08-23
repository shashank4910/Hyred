import type { Metadata } from 'next';
import { Mail, MessageCircle } from 'lucide-react';
import { LegalDocumentLayout } from '@/app/_components/LegalDocumentLayout';
import { LEGAL_CONTACT_EMAIL, PRODUCT_NAME, PUBLIC_CONTACT_EMAIL } from '@/lib/legal/site';

export const metadata: Metadata = {
  title: 'Contact us',
  description: `Get in touch with the ${PRODUCT_NAME} team.`,
  robots: 'noindex, follow',
};

export default function ContactPage() {
  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'ContactPage',
    name: 'Contact Hyred',
    url: 'https://hyred.in/contact',
    mainEntity: {
      '@type': 'Organization',
      name: 'Hyred',
      url: 'https://hyred.in',
      email: PUBLIC_CONTACT_EMAIL,
    },
  };

  return (
    <LegalDocumentLayout title="Contact us">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
      <p className="text-sm text-on-surface-variant mb-8">
        Questions about {PRODUCT_NAME}, feedback, bugs, or partnerships — we read every message and
        will get back to you as soon as we can.
      </p>

      <section className="rounded-2xl border border-outline-variant/30 bg-surface-container-lowest p-6 shadow-card not-prose">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl teal-gradient text-on-primary">
            <Mail className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-on-surface mb-1">Email us</h2>
            <p className="text-sm text-on-surface-variant mb-3">
              The best way to reach the team. Include your account email if your question is about
              your profile or matches.
            </p>
            <a
              href={`mailto:${PUBLIC_CONTACT_EMAIL}`}
              className="inline-flex items-center gap-2 text-base font-semibold text-primary hover:underline"
            >
              {PUBLIC_CONTACT_EMAIL}
            </a>
          </div>
        </div>
      </section>

      <section className="mt-8 space-y-3 text-sm text-on-surface-variant">
        <div className="flex items-start gap-2">
          <MessageCircle className="h-4 w-4 shrink-0 mt-0.5 text-primary" />
          <p>
            <strong className="text-on-surface">Privacy & data requests:</strong> for grievances,
            deletion, or policy questions, email{' '}
            <a href={`mailto:${LEGAL_CONTACT_EMAIL}`} className="text-primary hover:underline">
              {LEGAL_CONTACT_EMAIL}
            </a>
            .
          </p>
        </div>
        <p>
          We typically reply within <strong className="text-on-surface">1–2 business days</strong>.
          If you are reporting a bug, a screenshot and the steps to reproduce help us fix it faster.
        </p>
      </section>
    </LegalDocumentLayout>
  );
}
