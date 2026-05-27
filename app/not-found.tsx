import Link from 'next/link';
import { Compass } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-off-white">
      <div className="text-center space-y-4 max-w-sm">
        <div className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-amber/10 text-amber mx-auto">
          <Compass className="h-7 w-7" />
        </div>
        <h1 className="text-heading-sm font-semibold text-ink">Lost the signal</h1>
        <p className="text-body-sm text-stone">
          That page doesn&apos;t exist or has moved.
        </p>
        <Link href="/" className="btn-primary">
          Back to matches
        </Link>
      </div>
    </div>
  );
}
