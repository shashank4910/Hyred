'use client';

import Link from 'next/link';

export function SignUpLegalConsent({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-start gap-2.5 text-xs text-on-surface-variant leading-relaxed cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 shrink-0"
        required
      />
      <span>
        I confirm I am <strong className="text-on-surface font-medium">18 years or older</strong> and
        agree to the{' '}
        <Link href="/terms" target="_blank" className="text-primary font-medium hover:underline">
          Terms of Service
        </Link>{' '}
        and{' '}
        <Link href="/privacy" target="_blank" className="text-primary font-medium hover:underline">
          Privacy Policy
        </Link>
        , including automated processing of my resume and related data using AI providers as
        described there.
      </span>
    </label>
  );
}
