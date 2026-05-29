'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, RefreshCw, ChevronDown } from 'lucide-react';
import { toast } from 'sonner';

const ALL_SOURCES = [
  { id: 'linkedin', label: 'LinkedIn (guest API)', tokens: 'free' },
  { id: 'adzuna_in', label: 'Adzuna India', tokens: '~22/scan' },
  { id: 'jsearch', label: 'JSearch (Indeed+LinkedIn)', tokens: '5/scan' },
  { id: 'remotive', label: 'Remotive', tokens: 'free' },
  { id: 'remoteok', label: 'RemoteOK', tokens: 'free' },
  { id: 'hn', label: 'HN Who is Hiring', tokens: 'free' },
  { id: 'arbeitnow', label: 'Arbeitnow', tokens: 'free' },
];

export function RunIngestButton() {
  const [running, setRunning] = useState(false);
  const [, startTransition] = useTransition();
  const router = useRouter();
  const [showSourcePicker, setShowSourcePicker] = useState(false);
  const [selectedSources, setSelectedSources] = useState<string[]>([]);

  function toggleSource(id: string) {
    setSelectedSources((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id],
    );
  }

  async function run() {
    setRunning(true);
    const id = toast.loading(
      selectedSources.length > 0
        ? `Scanning ${selectedSources.length} source${selectedSources.length > 1 ? 's' : ''}...`
        : 'Scanning all job boards...',
    );
    try {
      const body = selectedSources.length > 0 ? { sources: selectedSources } : undefined;
      const res = await fetch('/api/ingest', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      });
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
    <div className="relative">
      <div className="flex items-center gap-0">
        <button onClick={run} disabled={running} className="btn-primary rounded-r-none">
          {running ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          {running ? 'Scanning...' : selectedSources.length > 0 ? `Scan (${selectedSources.length})` : 'Run scan'}
        </button>
        <button
          onClick={() => setShowSourcePicker((v) => !v)}
          disabled={running}
          className="btn-primary rounded-l-none border-l border-on-primary/20 px-2"
          title="Choose which sources to scan"
        >
          <ChevronDown className={`h-4 w-4 transition-transform ${showSourcePicker ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {showSourcePicker && (
        <div className="absolute right-0 top-full mt-2 z-50 w-72 rounded-xl border border-border-muted bg-surface-card shadow-elevated p-3 animate-fade-in">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-on-background">Select sources to scan</span>
            <button
              onClick={() => setSelectedSources([])}
              className="text-[10px] text-on-surface-variant hover:text-primary"
            >
              Clear (scan all)
            </button>
          </div>
          <div className="space-y-1">
            {ALL_SOURCES.map((s) => {
              const checked = selectedSources.includes(s.id);
              return (
                <label
                  key={s.id}
                  className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-all ${
                    checked ? 'bg-primary-fixed/50' : 'hover:bg-surface-container'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleSource(s.id)}
                    className="rounded border-border-muted text-primary focus:ring-primary/30"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium text-on-surface truncate">{s.label}</div>
                  </div>
                  <span className="text-[10px] text-on-surface-variant whitespace-nowrap">{s.tokens}</span>
                </label>
              );
            })}
          </div>
          <p className="mt-2 text-[10px] text-on-surface-variant">
            No selection = scan all. Select specific sources to save tokens.
          </p>
        </div>
      )}
    </div>
  );
}
