'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

export function RunIngestButton() {
  const [running, setRunning] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const router = useRouter();

  async function run() {
    setRunning(true);
    setMsg(null);
    try {
      const res = await fetch('/api/ingest', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Ingest failed');
      setMsg(
        `Fetched ${data.fetched}, new ${data.newJobs}, scored ${data.scored}, kept ${data.matchesCreated}.`,
      );
      startTransition(() => router.refresh());
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="flex items-center gap-3">
      {msg && <span className="text-xs text-muted">{msg}</span>}
      <button onClick={run} disabled={running} className="btn-primary">
        {running ? 'Running...' : 'Run ingest now'}
      </button>
    </div>
  );
}
