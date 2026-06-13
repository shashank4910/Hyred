'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Activity, RefreshCw, Loader2, Pause, Play, CheckCircle2, XCircle, Clock,
} from 'lucide-react';

type ActivityEntry = {
  id: string;
  createdAt: string;
  provider: string;
  model: string | null;
  operation: string;
  tokensIn: number;
  tokensOut: number;
  status: string;
  errorMessage: string | null;
  durationMs: number | null;
  keyId: string | null;
  keyLabel: string;
};

const PROVIDER_LABELS: Record<string, string> = {
  cerebras: 'Cerebras',
  groq: 'Groq',
  openai: 'OpenAI',
  gemini: 'Gemini',
  mistral: 'Mistral',
  sambanova: 'SambaNova',
  bluesminds: 'Bluesminds',
};

const PROVIDER_DOT: Record<string, string> = {
  cerebras: 'bg-orange-400',
  groq: 'bg-red-400',
  openai: 'bg-emerald-400',
  gemini: 'bg-blue-400',
  mistral: 'bg-amber-400',
  sambanova: 'bg-purple-400',
  bluesminds: 'bg-cyan-400',
};

function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  const diff = Math.max(0, Date.now() - then);
  const s = Math.floor(diff / 1000);
  if (s < 5) return 'just now';
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return new Date(iso).toLocaleDateString();
}

function clockTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function LlmActivityPanel() {
  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState(true);
  const [lastFetched, setLastFetched] = useState<Date | null>(null);
  const liveRef = useRef(live);
  liveRef.current = live;

  const fetchActivity = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/llm-keys/activity?limit=60', { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load activity');
      setEntries(data.entries ?? []);
      setError(null);
      setLastFetched(new Date());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchActivity();
    const id = setInterval(() => {
      if (liveRef.current) fetchActivity();
    }, 4000);
    return () => clearInterval(id);
  }, [fetchActivity]);

  const providerCounts: Record<string, number> = {};
  for (const e of entries) providerCounts[e.provider] = (providerCounts[e.provider] ?? 0) + 1;

  return (
    <section className="glass-card p-6">
      <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
        <h2 className="font-headline text-headline-md font-bold text-on-background flex items-center gap-2">
          <Activity className="h-5 w-5 text-primary" /> Live Key Activity
          {live && (
            <span className="inline-flex items-center gap-1.5 text-xs font-normal text-success-green ml-1">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success-green opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-success-green" />
              </span>
              live
            </span>
          )}
        </h2>
        <div className="flex items-center gap-2">
          {lastFetched && (
            <span className="text-xs text-on-surface-variant hidden sm:inline">
              updated {clockTime(lastFetched.toISOString())}
            </span>
          )}
          <button onClick={() => setLive((v) => !v)} className="btn text-xs" title={live ? 'Pause auto-refresh' : 'Resume auto-refresh'}>
            {live ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
            {live ? 'Pause' : 'Resume'}
          </button>
          <button onClick={fetchActivity} disabled={loading} className="btn text-xs">
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Refresh
          </button>
        </div>
      </div>

      <p className="text-xs text-on-surface-variant mb-4">
        Every LLM call (scoring, skill match, resume generation, chat) as it happens — which provider &amp; key answered, and whether it succeeded or rate-limited.
      </p>

      {error && (
        <div className="p-4 rounded-lg bg-error-container text-on-error-container text-sm mb-4">
          <p className="font-medium">Failed to load activity</p>
          <p className="text-xs mt-1">{error}</p>
          <p className="text-xs mt-2 opacity-70">Hint: Run migration 0009_llm_keys.sql in the Supabase SQL editor.</p>
        </div>
      )}

      {/* Provider tallies for the loaded window */}
      {!error && Object.keys(providerCounts).length > 0 && (
        <div className="flex flex-wrap gap-2 mb-4">
          {Object.entries(providerCounts)
            .sort((a, b) => b[1] - a[1])
            .map(([provider, count]) => (
              <span key={provider} className="inline-flex items-center gap-1.5 rounded-full border border-border-muted bg-surface-card px-3 py-1 text-xs">
                <span className={`h-2 w-2 rounded-full ${PROVIDER_DOT[provider] ?? 'bg-gray-400'}`} />
                {PROVIDER_LABELS[provider] ?? provider}
                <span className="text-on-surface-variant">{count}</span>
              </span>
            ))}
        </div>
      )}

      {!error && (
        <div className="overflow-x-auto rounded-xl border border-border-muted">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-surface-card text-on-surface-variant text-xs">
                <th className="text-left font-medium px-3 py-2 whitespace-nowrap">Time</th>
                <th className="text-left font-medium px-3 py-2">Provider</th>
                <th className="text-left font-medium px-3 py-2">Key</th>
                <th className="text-left font-medium px-3 py-2">Operation</th>
                <th className="text-left font-medium px-3 py-2 hidden md:table-cell">Model</th>
                <th className="text-right font-medium px-3 py-2 hidden sm:table-cell">Tokens</th>
                <th className="text-right font-medium px-3 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {loading && entries.length === 0 && (
                <tr><td colSpan={7} className="px-3 py-8 text-center text-on-surface-variant">
                  <Loader2 className="h-4 w-4 animate-spin inline mr-2" /> Loading activity…
                </td></tr>
              )}
              {!loading && entries.length === 0 && (
                <tr><td colSpan={7} className="px-3 py-8 text-center text-on-surface-variant">
                  No LLM calls recorded yet. Run a scan or generate a resume to see activity here.
                </td></tr>
              )}
              {entries.map((e) => {
                const ok = e.status === 'success';
                const rateLimited = e.status === 'rate_limited';
                return (
                  <tr key={e.id} className="border-t border-border-muted hover:bg-surface-card/50">
                    <td className="px-3 py-2 whitespace-nowrap text-on-surface-variant" title={new Date(e.createdAt).toLocaleString()}>
                      <span className="inline-flex items-center gap-1">
                        <Clock className="h-3 w-3 opacity-50" /> {timeAgo(e.createdAt)}
                      </span>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <span className="inline-flex items-center gap-1.5">
                        <span className={`h-2 w-2 rounded-full ${PROVIDER_DOT[e.provider] ?? 'bg-gray-400'}`} />
                        {PROVIDER_LABELS[e.provider] ?? e.provider}
                      </span>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap font-mono text-xs">{e.keyLabel}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{e.operation}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-on-surface-variant hidden md:table-cell font-mono text-xs">{e.model ?? '—'}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-right text-on-surface-variant hidden sm:table-cell">
                      {(e.tokensIn + e.tokensOut).toLocaleString()}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-right">
                      {ok ? (
                        <span className="inline-flex items-center gap-1 text-success-green text-xs" title={e.durationMs ? `${e.durationMs}ms` : undefined}>
                          <CheckCircle2 className="h-3.5 w-3.5" /> ok
                        </span>
                      ) : rateLimited ? (
                        <span className="inline-flex items-center gap-1 text-amber-500 text-xs" title={e.errorMessage ?? undefined}>
                          <XCircle className="h-3.5 w-3.5" /> 429
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-error text-xs" title={e.errorMessage ?? undefined}>
                          <XCircle className="h-3.5 w-3.5" /> error
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
