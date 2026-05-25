import Link from 'next/link';
import { Compass } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="text-center space-y-4 max-w-sm">
        <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary mx-auto">
          <Compass className="h-6 w-6" />
        </div>
        <h1 className="text-2xl font-semibold">Lost the signal</h1>
        <p className="text-sm text-muted">
          That page doesn&apos;t exist or has moved.
        </p>
        <Link href="/" className="btn-primary">
          Back to matches
        </Link>
      </div>
    </div>
  );
}
