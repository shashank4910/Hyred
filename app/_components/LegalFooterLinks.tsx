import Link from 'next/link';

export function LegalFooterLinks({ className = '' }: { className?: string }) {
  return (
    <p className={`text-xs text-stone ${className}`.trim()}>
      <Link href="/privacy" className="hover:text-ink underline underline-offset-2">
        Privacy Policy
      </Link>
      {' · '}
      <Link href="/terms" className="hover:text-ink underline underline-offset-2">
        Terms of Service
      </Link>
    </p>
  );
}
