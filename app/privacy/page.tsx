import type { Metadata } from 'next';
import { LegalDocumentLayout } from '@/app/_components/LegalDocumentLayout';
import {
  LEGAL_CONTACT_EMAIL,
  LEGAL_LAST_UPDATED,
  LEGAL_OPERATOR_NAME,
  PRODUCT_NAME,
} from '@/lib/legal/site';

export const metadata: Metadata = {
  title: 'Privacy Policy',
  robots: 'noindex, follow',
};

export default function PrivacyPage() {
  return (
    <LegalDocumentLayout title="Privacy Policy">
      <p className="text-sm text-stone mb-6">
        Last updated: {LEGAL_LAST_UPDATED}. This policy describes how {PRODUCT_NAME} (
        {LEGAL_OPERATOR_NAME}) handles your personal data when you use our job-matching service.
      </p>

      <h2>1. Who we are</h2>
      <p>
        {PRODUCT_NAME} is an AI-assisted job search tool. For privacy questions or complaints,
        contact us at{' '}
        <a href={`mailto:${LEGAL_CONTACT_EMAIL}`}>{LEGAL_CONTACT_EMAIL}</a> (Grievance /
        privacy contact).
      </p>

      <h2>2. What we collect</h2>
      <ul>
        <li>
          <strong>Account data:</strong> email address, name (including via Google sign-in if you
          use it).
        </li>
        <li>
          <strong>Resume & career data:</strong> resume text or uploaded files, job preferences,
          skills and roles inferred from your resume, match scores, notes, and generated content
          (e.g. tailored resumes or cover letters if you use those features).
        </li>
        <li>
          <strong>Application profile</strong> (optional): contact details, links, compensation
          preferences, and similar fields if you choose to save them for job applications.
        </li>
        <li>
          <strong>Usage data:</strong> scan history, match status, and basic technical logs needed
          to run the service (e.g. errors, performance).
        </li>
      </ul>

      <h2>3. Why we use it</h2>
      <p>We process your data to:</p>
      <ul>
        <li>create and manage your account;</li>
        <li>match your resume to job listings and score relevance;</li>
        <li>generate AI-assisted suggestions (skills, roles, resume edits, cover letters);</li>
        <li>operate, secure, and improve the service;</li>
        <li>respond to your requests and legal obligations.</li>
      </ul>
      <p>
        We rely on your <strong>consent</strong> for resume processing and AI analysis. You give
        this consent when you create an account and accept our Terms of Service and Privacy Policy
        at sign-up. That covers resumes you upload or paste later, including analysis by third-party
        AI providers (OpenRouter, OpenAI) for matching, scoring, and suggestions. We also rely on{' '}
        <strong>contract / legitimate use</strong> where needed to provide the service you signed
        up for.
      </p>

      <h2>4. Who we share data with</h2>
      <p>
        We use trusted service providers (&quot;processors&quot;) to run {PRODUCT_NAME}. Your data
        may be processed by:
      </p>
      <ul>
        <li>
          <strong>Supabase</strong> — database, authentication, file storage (may be hosted outside
          India).
        </li>
        <li>
          <strong>Vercel</strong> — application hosting.
        </li>
        <li>
          <strong>AI providers</strong> — e.g. OpenRouter and OpenAI — to analyze resumes, score jobs,
          and generate text. Resume content is sent to these providers only to perform features you
          use.
        </li>
        <li>
          <strong>Google</strong> — if you choose &quot;Continue with Google&quot; for sign-in.
        </li>
        <li>
          <strong>Job data sources</strong> — we fetch job listings from third-party APIs and
          public sources; we do not sell your personal data to them.
        </li>
      </ul>
      <p>
        We do <strong>not</strong> sell your personal data. We share data only as needed to operate
        the service or comply with law.
      </p>

      <h2>5. Cross-border transfer</h2>
      <p>
        Some providers may store or process data in countries outside India (including the United
        States). By using {PRODUCT_NAME} and consenting to resume processing, you understand your
        data may be transferred for these purposes, subject to appropriate safeguards offered by
        those providers.
      </p>

      <h2>6. How long we keep data</h2>
      <ul>
        <li>Account and profile data — until you delete your account or ask us to delete it.</li>
        <li>Matches and generated content — until deleted with your account or updated by you.</li>
        <li>Operational logs — typically up to 90 days, unless longer retention is required by law.</li>
      </ul>

      <h2>7. Your rights (India — DPDP Act)</h2>
      <p>You may:</p>
      <ul>
        <li>ask what personal data we hold about you;</li>
        <li>request correction of inaccurate data;</li>
        <li>withdraw consent where processing is consent-based (this may limit features);</li>
        <li>request erasure of your data, subject to legal exceptions;</li>
        <li>raise a grievance with us at {LEGAL_CONTACT_EMAIL}.</li>
      </ul>
      <p>
        We will respond to reasonable requests within a practical timeframe. Account deletion
        features may be added in the app; until then, email us to request deletion.
      </p>

      <h2>8. Security</h2>
      <p>
        We use industry-standard measures (encrypted connections, access controls, authenticated
        accounts). No system is 100% secure — please use a strong password and do not share
        credentials.
      </p>

      <h2>9. Children</h2>
      <p>
        {PRODUCT_NAME} is not intended for users under <strong>18</strong>. We do not knowingly
        collect data from children.
      </p>

      <h2>10. Changes</h2>
      <p>
        We may update this policy. We will post the new date at the top. Continued use after
        changes means you accept the updated policy where permitted by law.
      </p>

      <p className="text-sm text-stone mt-8">
        This document is provided for transparency and does not constitute legal advice. Consider
        independent legal review before a large public launch.
      </p>
    </LegalDocumentLayout>
  );
}
