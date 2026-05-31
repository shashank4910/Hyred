import Link from 'next/link';

export function LegalFooterLinks({ className = '' }: { className?: string }) {
  return (
    <p className={`text-xs text-on-surface-variant ${className}`.trim()}>
      <Link href="/privacy" className="hover:text-on-surface underline underline-offset-2">
        Privacy Policy
      </Link>
      {' · '}
      <Link href="/terms" className="hover:text-on-surface underline underline-offset-2">
        Terms of Service
      </Link>
    </p>
  );
}
