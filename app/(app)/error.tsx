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
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="card max-w-xl mx-auto text-center mt-8 space-y-3 py-10">
      <div className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-red-50 text-warning-red mx-auto">
        <AlertTriangle className="h-5 w-5" />
      </div>
      <h2 className="text-lg font-semibold text-ink">Something went wrong</h2>
      <p className="text-sm text-stone break-words">{error.message}</p>
      <button onClick={reset} className="btn-primary">
        <RotateCw className="h-4 w-4" /> Try again
      </button>
    </div>
  );
}
