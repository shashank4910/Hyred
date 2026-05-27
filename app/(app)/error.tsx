'use client';

import { useEffect } from 'react';
import { AlertTriangle, RotateCw } from 'lucide-react';

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => { console.error(error); }, [error]);

  return (
    <div className="card max-w-lg mx-auto text-center mt-16">
      <div className="inline-flex h-12 w-12 items-center justify-center rounded-card bg-red-50 text-warning-red mx-auto">
        <AlertTriangle className="h-5 w-5" />
      </div>
      <h2 className="text-subheading font-semibold text-ink mt-4">Something went wrong</h2>
      <p className="text-body-sm text-stone mt-2 break-words">{error.message}</p>
      <div className="mt-5">
        <button onClick={reset} className="btn-primary">
          <RotateCw className="h-4 w-4" /> Try again
        </button>
      </div>
    </div>
  );
}
