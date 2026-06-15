'use client';

import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import {
  Shield, Key, BarChart3, AlertTriangle, RefreshCw,
  Loader2, Plus, Trash2, CheckCircle2, XCircle,
} from 'lucide-react';
import { LlmKeysPanel } from './LlmKeysPanel';
import { LlmActivityPanel } from './LlmActivityPanel';
import { JobsControlPanel } from './JobsControlPanel';

type UsageSummary = {
  bySource: Record<string, { total: number; success: number; rateLimited: number; errors: number }>;
  byKey: Record<string, { source: string; total: number; success: number; rateLimited: number; lastUsed: string }>;
  recentErrors: Array<{ source: string; key_identifier: string; error_message: string; created_at: string; http_status: number | null }>;
  totalRequests: number;
};


export function AdminDashboard() {
  const [stats, setStats] = useState<UsageSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [days, setDays] = useState(30);

  // Key management state
  const [jsearchKeys, setJsearchKeys] = useState<string[]>([]);
  const [adzunaKeys, setAdzunaKeys] = useState<string[]>([]);
  const [newJsearchKey, setNewJsearchKey] = useState('');
  const [newAdzunaKey, setNewAdzunaKey] = useState('');
  const [savingKeys, setSavingKeys] = useState(false);
  const [envKeys, setEnvKeys] = useState<Record<string, string[]>>({});

  async function fetchStats() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/stats?days=${days}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to fetch stats');
      setStats(data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function fetchKeys() {
    try {
      const res = await fetch('/api/admin/keys');
      const data = await res.json();
      if (res.ok) {
        const stored = data.stored ?? {};
        setJsearchKeys((stored.jsearch ?? []).map((k: { full: string }) => k.full));
        setAdzunaKeys((stored.adzuna ?? []).map((k: { full: string }) => k.full));
        setEnvKeys(data.env ?? {});
      }
    } catch { /* ignore */ }
  }

  useEffect(() => { fetchStats(); fetchKeys(); }, [days]);


  async function saveKeys(source: string, keys: string[]) {
    setSavingKeys(true);
    try {
      const res = await fetch('/api/admin/keys', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ source, keys }),
      });
      if (!res.ok) throw new Error('Failed to save');
      toast.success(`${source} keys saved (${keys.length} keys)`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSavingKeys(false);
    }
  }

  function addJsearchKey() {
    const k = newJsearchKey.trim();
    if (!k) return;
    if (jsearchKeys.includes(k)) { toast('Key already exists'); return; }
    const updated = [...jsearchKeys, k];
    setJsearchKeys(updated);
    setNewJsearchKey('');
    saveKeys('jsearch', updated);
  }

  function removeJsearchKey(idx: number) {
    const updated = jsearchKeys.filter((_, i) => i !== idx);
    setJsearchKeys(updated);
    saveKeys('jsearch', updated);
  }

  function addAdzunaKey() {
    const k = newAdzunaKey.trim();
    if (!k || !k.includes(':')) { toast.error('Format: appId:appKey'); return; }
    if (adzunaKeys.includes(k)) { toast('Credential already exists'); return; }
    const updated = [...adzunaKeys, k];
    setAdzunaKeys(updated);
    setNewAdzunaKey('');
    saveKeys('adzuna', updated);
  }

  function removeAdzunaKey(idx: number) {
    const updated = adzunaKeys.filter((_, i) => i !== idx);
    setAdzunaKeys(updated);
    saveKeys('adzuna', updated);
  }

  function maskKeyDisplay(key: string): string {
    if (key.length <= 10) return '***';
    return `${key.slice(0, 6)}...${key.slice(-4)}`;
  }


  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-error-container text-on-error-container text-xs font-medium tracking-wide mb-3">
            <Shield className="h-3.5 w-3.5" />
            <span>OWNER ONLY</span>
          </div>
          <h1 className="font-headline text-headline-lg-mobile md:text-heading-sm font-bold text-on-background">
            Admin Center
          </h1>
          <p className="text-body-md text-on-surface-variant mt-1">
            API key management, usage tracking, and error diagnostics.
          </p>
        </div>
        <button onClick={fetchStats} disabled={loading} className="btn">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Refresh
        </button>
      </div>

      {/* Time range selector */}
      <div className="flex gap-2">
        {[7, 14, 30, 60].map((d) => (
          <button
            key={d}
            onClick={() => setDays(d)}
            className={days === d
              ? 'px-3 py-1.5 rounded-full text-xs font-medium bg-primary text-on-primary'
              : 'px-3 py-1.5 rounded-full text-xs font-medium border border-border-muted text-on-surface-variant hover:bg-primary-fixed/30'
            }
          >
            {d} days
          </button>
        ))}
      </div>


      {/* === LLM KEYS & TOKEN USAGE (Primary — Cerebras/Groq/OpenAI) === */}
      <LlmKeysPanel />

      {/* === LIVE LLM KEY ACTIVITY (which key answered each call, in real time) === */}
      <LlmActivityPanel />

      {/* === JOBS & MATCHES LIFECYCLE CONTROL === */}
      <JobsControlPanel />


      {/* === SECTION 1: Job Source Usage Overview === */}
      <section className="glass-card p-6" style={{ contentVisibility: 'auto', containIntrinsicSize: '300px' }}>
        <h2 className="font-headline text-headline-md font-bold text-on-background flex items-center gap-2 mb-4">
          <BarChart3 className="h-5 w-5 text-primary" /> Job Source API Usage
        </h2>
        {loading && !stats && <div className="skeleton h-32 w-full" />}
        {error && (
          <div className="p-4 rounded-lg bg-error-container text-on-error-container text-sm">
            <p className="font-medium">Failed to load stats</p>
            <p className="text-xs mt-1">{error}</p>
            <p className="text-xs mt-2 opacity-70">Hint: Run the migration SQL to create the api_request_logs table.</p>
          </div>
        )}
        {stats && (
          <div className="space-y-4">
            <div className="text-sm text-on-surface-variant">
              Total requests in last {days} days: <span className="font-bold text-on-background">{stats.totalRequests}</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {Object.entries(stats.bySource).map(([source, s]) => (
                <div key={source} className="rounded-xl border border-border-muted p-4 bg-surface-card">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium text-on-background capitalize">{source}</span>
                    <span className="text-xs text-on-surface-variant">{s.total} calls</span>
                  </div>
                  <div className="flex gap-3 text-xs">
                    <span className="flex items-center gap-1 text-success-green">
                      <CheckCircle2 className="h-3 w-3" /> {s.success}
                    </span>
                    <span className="flex items-center gap-1 text-secondary">
                      <AlertTriangle className="h-3 w-3" /> {s.rateLimited} limited
                    </span>
                    <span className="flex items-center gap-1 text-error">
                      <XCircle className="h-3 w-3" /> {s.errors}
                    </span>
                  </div>
                  {/* Usage bar */}
                  <div className="mt-2 h-2 rounded-full bg-surface-container overflow-hidden">
                    <div className="h-full flex">
                      <div className="bg-success-green" style={{ width: `${(s.success / Math.max(s.total, 1)) * 100}%` }} />
                      <div className="bg-secondary" style={{ width: `${(s.rateLimited / Math.max(s.total, 1)) * 100}%` }} />
                      <div className="bg-error" style={{ width: `${(s.errors / Math.max(s.total, 1)) * 100}%` }} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>


      {/* === SECTION 2: Per-Key Breakdown === */}
      {stats && Object.keys(stats.byKey).length > 0 && (
        <section className="glass-card p-6" style={{ contentVisibility: 'auto', containIntrinsicSize: '300px' }}>
          <h2 className="font-headline text-headline-md font-bold text-on-background flex items-center gap-2 mb-4">
            <Key className="h-5 w-5 text-secondary" /> Per-Key Usage
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border-muted text-left text-xs text-on-surface-variant uppercase tracking-wide">
                  <th className="pb-2 pr-4">Source</th>
                  <th className="pb-2 pr-4">Key</th>
                  <th className="pb-2 pr-4">Requests</th>
                  <th className="pb-2 pr-4">Success</th>
                  <th className="pb-2 pr-4">Rate Limited</th>
                  <th className="pb-2">Last Used</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(stats.byKey).map(([label, k]) => (
                  <tr key={label} className="border-b border-border-muted/50">
                    <td className="py-2 pr-4 font-medium capitalize">{k.source}</td>
                    <td className="py-2 pr-4 font-mono text-xs text-on-surface-variant">
                      {label.split('::')[1] || '—'}
                    </td>
                    <td className="py-2 pr-4">{k.total}</td>
                    <td className="py-2 pr-4 text-success-green">{k.success}</td>
                    <td className="py-2 pr-4 text-secondary">
                      {k.rateLimited > 0 && <span className="font-bold">{k.rateLimited}</span>}
                      {k.rateLimited === 0 && '0'}
                    </td>
                    <td className="py-2 text-xs text-on-surface-variant">
                      {new Date(k.lastUsed).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}


      {/* === SECTION 3: Error Log === */}
      {stats && stats.recentErrors.length > 0 && (
        <section className="glass-card p-6" style={{ contentVisibility: 'auto', containIntrinsicSize: '300px' }}>
          <h2 className="font-headline text-headline-md font-bold text-on-background flex items-center gap-2 mb-4">
            <AlertTriangle className="h-5 w-5 text-error" /> Recent Errors & Rate Limits
          </h2>
          <div className="space-y-2 max-h-[400px] overflow-y-auto">
            {stats.recentErrors.map((e, i) => (
              <div key={i} className="rounded-lg border border-border-muted p-3 bg-surface-card text-sm">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${
                      e.http_status === 429 || e.http_status === 403
                        ? 'bg-secondary-fixed text-on-secondary-fixed-variant'
                        : 'bg-error-container text-on-error-container'
                    }`}>
                      {e.http_status === 429 ? 'RATE LIMITED' : e.http_status === 403 ? 'QUOTA EXHAUSTED' : `ERROR ${e.http_status ?? ''}`}
                    </span>
                    <span className="font-medium capitalize">{e.source}</span>
                    {e.key_identifier && (
                      <span className="font-mono text-xs text-on-surface-variant">{e.key_identifier}</span>
                    )}
                  </div>
                  <span className="text-xs text-on-surface-variant">
                    {new Date(e.created_at).toLocaleString()}
                  </span>
                </div>
                <p className="mt-1 text-xs text-on-surface-variant font-mono break-all">
                  {e.error_message}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}


      {/* === SECTION 4: API Key Management === */}
      <section className="glass-card p-6" style={{ contentVisibility: 'auto', containIntrinsicSize: '500px' }}>
        <h2 className="font-headline text-headline-md font-bold text-on-background flex items-center gap-2 mb-4">
          <Key className="h-5 w-5 text-primary" /> API Key Management
        </h2>

        {/* Env-configured keys (read-only display) */}
        {Object.keys(envKeys).length > 0 && (
          <div className="mb-6 p-4 rounded-lg bg-surface-container border border-border-muted">
            <p className="text-xs font-medium text-on-surface-variant mb-2 uppercase tracking-wide">
              Keys from Environment Variables (read-only)
            </p>
            {Object.entries(envKeys).map(([source, keys]) => (
              <div key={source} className="flex items-center gap-2 text-sm mb-1">
                <span className="font-medium capitalize w-20">{source}:</span>
                <span className="text-on-surface-variant">{keys.length} key{keys.length !== 1 ? 's' : ''} configured</span>
              </div>
            ))}
            <p className="text-[10px] text-on-surface-variant mt-2">
              These are set in Vercel env vars. Keys below are stored in the DB and merged with these.
            </p>
          </div>
        )}

        {/* JSearch Keys */}
        <div className="mb-6">
          <h3 className="text-sm font-semibold text-on-background mb-2">
            JSearch (RapidAPI) Keys
          </h3>
          <p className="text-xs text-on-surface-variant mb-3">
            Each key = ~200 requests/month. Add multiple accounts for unlimited usage.
          </p>
          <div className="space-y-2 mb-3">
            {jsearchKeys.map((k, i) => (
              <div key={i} className="flex items-center gap-2 p-2 rounded-lg bg-surface-container border border-border-muted">
                <span className="font-mono text-xs flex-1 text-on-surface-variant">{maskKeyDisplay(k)}</span>
                <button onClick={() => removeJsearchKey(i)} className="text-error hover:bg-error-container p-1 rounded" title="Remove">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={newJsearchKey}
              onChange={(e) => setNewJsearchKey(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addJsearchKey()}
              placeholder="Paste RapidAPI key here..."
              className="input flex-1 text-xs"
            />
            <button onClick={addJsearchKey} disabled={savingKeys} className="btn-primary text-xs">
              <Plus className="h-3.5 w-3.5" /> Add
            </button>
          </div>
        </div>


        {/* Adzuna Credentials */}
        <div>
          <h3 className="text-sm font-semibold text-on-background mb-2">
            Adzuna Credentials
          </h3>
          <p className="text-xs text-on-surface-variant mb-3">
            Format: <code className="bg-surface-container px-1 rounded">appId:appKey</code>. Each account = 250 calls/month.
          </p>
          <div className="space-y-2 mb-3">
            {adzunaKeys.map((k, i) => (
              <div key={i} className="flex items-center gap-2 p-2 rounded-lg bg-surface-container border border-border-muted">
                <span className="font-mono text-xs flex-1 text-on-surface-variant">{maskKeyDisplay(k)}</span>
                <button onClick={() => removeAdzunaKey(i)} className="text-error hover:bg-error-container p-1 rounded" title="Remove">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={newAdzunaKey}
              onChange={(e) => setNewAdzunaKey(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addAdzunaKey()}
              placeholder="appId:appKey"
              className="input flex-1 text-xs"
            />
            <button onClick={addAdzunaKey} disabled={savingKeys} className="btn-primary text-xs">
              <Plus className="h-3.5 w-3.5" /> Add
            </button>
          </div>
        </div>
      </section>

      {/* === SECTION 5: Migration SQL === */}
      <section className="glass-card p-6">
        <h2 className="font-headline text-headline-md font-bold text-on-background mb-4">
          Setup: Migration SQL
        </h2>
        <p className="text-xs text-on-surface-variant mb-3">
          Run this once in Supabase SQL Editor to create the required tables:
        </p>
        <pre className="p-4 rounded-lg bg-surface-container border border-border-muted text-xs font-mono overflow-x-auto whitespace-pre-wrap text-on-surface-variant">
{`-- API request tracking
CREATE TABLE IF NOT EXISTS api_request_logs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  source text NOT NULL,
  key_identifier text,
  status text NOT NULL DEFAULT 'success',
  http_status int,
  error_message text,
  query text,
  jobs_returned int DEFAULT 0,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_api_logs_source ON api_request_logs(source);
CREATE INDEX IF NOT EXISTS idx_api_logs_created ON api_request_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_api_logs_status ON api_request_logs(status);

-- Admin settings (key-value store for API keys etc.)
CREATE TABLE IF NOT EXISTS admin_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL DEFAULT '{}',
  updated_at timestamptz DEFAULT now()
);`}
        </pre>
      </section>
    </div>
  );
}
