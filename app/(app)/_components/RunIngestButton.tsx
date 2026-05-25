'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

export function RunIngestButton() {
  const [running, setRunning] = useState(false);
  const [, startTransition] = useTransition();
  const router = useRouter();

  async function run() {
    setRunning(true);
    const id = toast.loading('Scanning job boards...');
    try {
      const res = await fetch('/api/ingest', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Ingest failed');
      toast.success(
        `${data.matchesCreated} new match${data.matchesCreated === 1 ? '' : 'es'} · ${data.fetched} jobs scanned`,
        { id },
      );
      startTransition(() => router.refresh());
    } catch (e) {
      toast.error((e as Error).message, { id });
    } finally {
      setRunning(false);
    }
  }

  return (
    <button onClick={run} disabled={running} className="btn-primary">
      {running ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <RefreshCw className="h-4 w-4" />
      )}
      {running ? 'Scanning...' : 'Run scan'}
    </button>
  );
}
