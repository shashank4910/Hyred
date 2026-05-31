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
    <label className="flex items-start gap-2.5 text-xs text-stone leading-relaxed cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 accent-amber shrink-0"
        required
      />
      <span>
        I confirm I am <strong className="text-ink font-medium">18 years or older</strong> and
        agree to the{' '}
        <Link href="/terms" target="_blank" className="text-amber font-medium hover:underline">
          Terms of Service
        </Link>{' '}
        and{' '}
        <Link href="/privacy" target="_blank" className="text-amber font-medium hover:underline">
          Privacy Policy
        </Link>
        .
      </span>
    </label>
  );
}

export function ResumeAiConsent({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-start gap-2.5 text-sm text-stone leading-relaxed cursor-pointer rounded-card border border-border-muted bg-off-white px-3 py-3">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 accent-amber shrink-0"
      />
      <span>
        I consent to Hyred <strong className="text-ink font-medium">processing my resume</strong>{' '}
        using automated tools, including third-party AI providers listed in the{' '}
        <Link href="/privacy" target="_blank" className="text-amber font-medium hover:underline">
          Privacy Policy
        </Link>
        , to match me with jobs and generate related suggestions.
      </span>
    </label>
  );
}
