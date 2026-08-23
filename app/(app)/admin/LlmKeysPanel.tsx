'use client';

import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import {
  Cpu, Plus, Trash2, Power, PowerOff, RefreshCw,
  Loader2, AlertTriangle, TrendingUp, Zap,
} from 'lucide-react';
import PremiumSelect from '@/app/_components/ui/PremiumSelect';

type LlmKeyRow = {
  id: string;
  provider: string;
  api_key_masked: string;
  label: string | null;
  model: string | null;
  base_url: string | null;
  daily_token_limit: number;
  tokens_used_today: number;
  requests_today: number;
  last_reset_at: string;
  is_active: boolean;
  priority: number;
  created_at: string;
};

type UsageSummary = {
  byProvider: Record<string, { totalTokens: number; totalRequests: number; errors: number; rateLimited: number }>;
  byKey: Array<{
    id: string;
    provider: string;
    label: string | null;
    tokensToday: number;
    dailyLimit: number;
    percentUsed: number;
    requestsToday: number;
    isActive: boolean;
    totalTokensInPeriod: number;
  }>;
  totalTokens: number;
  totalRequests: number;
  dailyBreakdown: Array<{ date: string; tokens: number; requests: number }>;
};

type ProviderDefaults = Record<string, { baseUrl: string; model: string }>;

type ProviderBudgetConfig = {
  mode: 'tokens' | 'requests' | 'pi_credits';
  defaultDailyLimit: number;
  limitLabel: string;
  freeTierNote: string;
};

const PROVIDER_LABELS: Record<string, string> = {
  cerebras: 'Cerebras', // inactive — kept for DB compat (Session 52)
  groq: 'Groq', // inactive — kept for DB compat
  openai: 'OpenAI',
  gemini: 'Google Gemini', // inactive — kept for DB compat
  mistral: 'Mistral', // inactive — kept for DB compat
  sambanova: 'SambaNova', // inactive — kept for DB compat
  bluesminds: 'Bluesminds', // inactive — kept for DB compat
  openrouter: 'OpenRouter',
};

const PROVIDER_FREE_LIMITS: Record<string, string> = {
  cerebras: '1M tokens/day', // inactive
  groq: '~100K tokens/day', // inactive
  openai: 'Paid ($0.15/1M in)',
  gemini: '~1,000 req/day', // inactive
  mistral: 'Free tier', // inactive
  sambanova: '10-30 RPM', // inactive
  bluesminds: '500 pi credits · 300 req/day · 20 RPM', // inactive
  openrouter: 'Prepaid credit (top-up at openrouter.ai)',
};

function keyBudgetUsed(k: LlmKeyRow, mode: string): number {
  return mode === 'requests' ? k.requests_today : k.tokens_used_today;
}

export function LlmKeysPanel() {
  const [keys, setKeys] = useState<LlmKeyRow[]>([]);
  const [usage, setUsage] = useState<UsageSummary | null>(null);
  const [providers, setProviders] = useState<ProviderDefaults>({});
  const [budgets, setBudgets] = useState<Record<string, ProviderBudgetConfig>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Add key form state
  const [showAddForm, setShowAddForm] = useState(false);
  const [newProvider, setNewProvider] = useState('openrouter');
  const [newApiKey, setNewApiKey] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [newDailyLimit, setNewDailyLimit] = useState(1000000);
  const [saving, setSaving] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/llm-keys?days=7');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load');
      setKeys(data.keys ?? []);
      setUsage(data.usage ?? null);
      setProviders(data.providers ?? {});
      setBudgets(data.budgets ?? {});
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  async function addKey() {
    if (!newApiKey.trim()) { toast.error('API key is required'); return; }
    setSaving(true);
    try {
      const res = await fetch('/api/admin/llm-keys', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          provider: newProvider,
          apiKey: newApiKey.trim(),
          label: newLabel.trim() || undefined,
          dailyTokenLimit: newDailyLimit,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to add key');
      toast.success(`${PROVIDER_LABELS[newProvider] ?? newProvider} key added!`);
      setNewApiKey('');
      setNewLabel('');
      setShowAddForm(false);
      fetchData();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function toggleKey(id: string, currentActive: boolean) {
    try {
      const res = await fetch(`/api/admin/llm-keys/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ is_active: !currentActive }),
      });
      if (!res.ok) throw new Error('Failed to update');
      toast.success(currentActive ? 'Key disabled' : 'Key enabled');
      fetchData();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function deleteKey(id: string, label: string | null) {
    if (!confirm(`Delete key "${label || id.slice(0, 8)}"? This cannot be undone.`)) return;
    try {
      const res = await fetch(`/api/admin/llm-keys/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete');
      toast.success('Key deleted');
      fetchData();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function resetProviderCounters(provider: string) {
    const label = provider === 'all' ? 'ALL providers' : (PROVIDER_LABELS[provider] ?? provider);
    if (!confirm(`Reset today's token counters to 0 for ${label}?`)) return;
    try {
      const res = await fetch('/api/admin/llm-keys/reset', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ provider }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Reset failed');
      toast.success(`Reset ${data.reset} key(s) — counters back to 0${data.repaired ? `; fixed ${data.repaired} limit(s)` : ''}`);
      fetchData();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  function formatTokens(n: number): string {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
    return String(n);
  }

  // Group keys by provider
  const keysByProvider: Record<string, LlmKeyRow[]> = {};
  for (const k of keys) {
    if (!keysByProvider[k.provider]) keysByProvider[k.provider] = [];
    keysByProvider[k.provider].push(k);
  }

  // Total daily capacity
  const totalDailyCapacity = keys
    .filter((k) => k.is_active)
    .reduce((s, k) => s + k.daily_token_limit, 0);
  const totalUsedToday = keys.reduce((s, k) => s + k.tokens_used_today, 0);

  return (
    <section className="glass-card p-6">
      <div className="flex items-center justify-between flex-wrap gap-3 mb-6">
        <h2 className="font-headline text-headline-md font-bold text-on-background flex items-center gap-2">
          <Cpu className="h-5 w-5 text-primary" /> LLM Keys & Token Usage
        </h2>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => resetProviderCounters('all')}
            className="btn text-xs"
            title="Reset all LLM key counters back to 0"
          >
            Reset counters
          </button>
          <button onClick={fetchData} disabled={loading} className="btn text-xs">
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Refresh
          </button>
          <button onClick={() => setShowAddForm(true)} className="btn-primary text-xs">
            <Plus className="h-3.5 w-3.5" /> Add Key
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-lg bg-error-container text-on-error-container text-sm mb-4">
          <p className="font-medium">Failed to load LLM keys</p>
          <p className="text-xs mt-1">{error}</p>
          <p className="text-xs mt-2 opacity-70">Hint: Run migration 0009_llm_keys.sql in the Supabase SQL editor.</p>
        </div>
      )}

      {/* === Summary Cards === */}
      {!error && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <div className="rounded-xl border border-border-muted p-4 bg-surface-card">
            <div className="text-xs text-on-surface-variant">Active Keys</div>
            <div className="text-xl font-bold text-on-background mt-1">
              {keys.filter((k) => k.is_active).length}
            </div>
          </div>
          <div className="rounded-xl border border-border-muted p-4 bg-surface-card">
            <div className="text-xs text-on-surface-variant">Daily Capacity</div>
            <div className="text-xl font-bold text-primary mt-1">
              {formatTokens(totalDailyCapacity)}
            </div>
          </div>
          <div className="rounded-xl border border-border-muted p-4 bg-surface-card">
            <div className="text-xs text-on-surface-variant">Used Today</div>
            <div className="text-xl font-bold text-on-background mt-1">
              {formatTokens(totalUsedToday)}
            </div>
          </div>
          <div className="rounded-xl border border-border-muted p-4 bg-surface-card">
            <div className="text-xs text-on-surface-variant">Remaining Today</div>
            <div className={`text-xl font-bold mt-1 ${
              totalDailyCapacity - totalUsedToday < totalDailyCapacity * 0.1
                ? 'text-error'
                : 'text-success-green'
            }`}>
              {formatTokens(Math.max(0, totalDailyCapacity - totalUsedToday))}
            </div>
          </div>
        </div>
      )}

      {/* === Overall usage bar === */}
      {totalDailyCapacity > 0 && (
        <div className="mb-6">
          <div className="flex items-center justify-between text-xs text-on-surface-variant mb-1">
            <span>Today&apos;s usage across all keys</span>
            <span>{Math.round((totalUsedToday / totalDailyCapacity) * 100)}%</span>
          </div>
          <div className="h-3 rounded-full bg-surface-container overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                totalUsedToday / totalDailyCapacity > 0.9
                  ? 'bg-error'
                  : totalUsedToday / totalDailyCapacity > 0.7
                    ? 'bg-secondary'
                    : 'bg-primary'
              }`}
              style={{ width: `${Math.min(100, (totalUsedToday / totalDailyCapacity) * 100)}%` }}
            />
          </div>
        </div>
      )}

      {/* === Per-provider breakdown === */}
      {usage && Object.keys(usage.byProvider).length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
          {Object.entries(usage.byProvider).map(([provider, stats]) => (
            <div key={provider} className="rounded-xl border border-border-muted p-4 bg-surface-card">
              <div className="flex items-center justify-between mb-2">
                <span className="font-medium text-on-background text-sm">
                  {PROVIDER_LABELS[provider] ?? provider}
                </span>
                <span className="text-[10px] text-on-surface-variant bg-surface-container px-2 py-0.5 rounded-full">
                  {PROVIDER_FREE_LIMITS[provider] ?? ''}
                </span>
              </div>
              <div className="flex gap-4 text-xs">
                <span className="flex items-center gap-1 text-primary">
                  <TrendingUp className="h-3 w-3" /> {formatTokens(stats.totalTokens)} tokens
                </span>
                <span className="flex items-center gap-1 text-on-surface-variant">
                  <Zap className="h-3 w-3" /> {stats.totalRequests} calls
                </span>
              </div>
              {stats.rateLimited > 0 && (
                <div className="mt-1.5 flex items-center gap-1 text-xs text-secondary">
                  <AlertTriangle className="h-3 w-3" /> {stats.rateLimited} rate limited
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* === Keys list by provider === */}
      {Object.entries(keysByProvider).map(([provider, providerKeys]) => (
        <div key={provider} className="mb-6">
          <h3 className="text-sm font-semibold text-on-background mb-3 flex items-center gap-2">
            <span className="inline-flex items-center justify-center w-5 h-5 rounded bg-primary-fixed text-primary text-[10px] font-bold">
              {providerKeys.filter((k) => k.is_active).length}
            </span>
            {PROVIDER_LABELS[provider] ?? provider}
            <span className="text-xs font-normal text-on-surface-variant">
              — {PROVIDER_FREE_LIMITS[provider] ?? ''} per key
            </span>
          </h3>
          <div className="space-y-2">
            {providerKeys.map((k) => {
              const budgetMode = budgets[k.provider]?.mode ?? 'tokens';
              const used = keyBudgetUsed(k, budgetMode);
              const pct = k.daily_token_limit > 0
                ? Math.round((used / k.daily_token_limit) * 100)
                : 0;
              const isWarning = pct > 80;
              const isExhausted = pct >= 100;

              return (
                <div
                  key={k.id}
                  className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${
                    !k.is_active
                      ? 'border-border-muted bg-surface-container/50 opacity-60'
                      : isExhausted
                        ? 'border-error/30 bg-error-container/10'
                        : isWarning
                          ? 'border-secondary/30 bg-secondary-fixed/10'
                          : 'border-border-muted bg-surface-card'
                  }`}
                >
                  {/* Status dot */}
                  <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                    !k.is_active ? 'bg-outline' :
                    isExhausted ? 'bg-error' :
                    isWarning ? 'bg-secondary' : 'bg-success-green'
                  }`} />

                  {/* Key info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm text-on-background truncate">
                        {k.label || k.api_key_masked}
                      </span>
                      {k.label && (
                        <span className="font-mono text-[10px] text-on-surface-variant">
                          {k.api_key_masked}
                        </span>
                      )}
                      {!k.is_active && (
                        <span className="text-[10px] uppercase tracking-wide text-outline bg-surface-container px-1.5 py-0.5 rounded-full">
                          disabled
                        </span>
                      )}
                      {isExhausted && k.is_active && (
                        <span className="text-[10px] uppercase tracking-wide text-error bg-error-container px-1.5 py-0.5 rounded-full">
                          exhausted
                        </span>
                      )}
                    </div>

                    {/* Usage bar */}
                    <div className="mt-1.5 flex items-center gap-2">
                      <div className="flex-1 h-1.5 rounded-full bg-surface-container overflow-hidden max-w-[200px]">
                        <div
                          className={`h-full rounded-full ${
                            isExhausted ? 'bg-error' : isWarning ? 'bg-secondary' : 'bg-primary'
                          }`}
                          style={{ width: `${Math.min(100, pct)}%` }}
                        />
                      </div>
                      <span className="text-[11px] text-on-surface-variant whitespace-nowrap">
                        {budgetMode === 'requests'
                          ? `${used} / ${k.daily_token_limit} req`
                          : `${formatTokens(k.tokens_used_today)} / ${formatTokens(k.daily_token_limit)}`}
                        <span className="text-on-surface-variant/60 ml-1">({pct}%)</span>
                      </span>
                      <span className="text-[10px] text-on-surface-variant">
                        · {k.requests_today} calls
                        {budgetMode === 'requests' && k.tokens_used_today > 0 && (
                          <span className="text-on-surface-variant/60">
                            {' '}· {formatTokens(k.tokens_used_today)} LLM tokens (info)
                          </span>
                        )}
                      </span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => toggleKey(k.id, k.is_active)}
                      className={`p-1.5 rounded-lg transition-all ${
                        k.is_active
                          ? 'text-success-green hover:bg-success-green/10'
                          : 'text-outline hover:bg-surface-container'
                      }`}
                      title={k.is_active ? 'Disable key' : 'Enable key'}
                    >
                      {k.is_active ? <Power className="h-4 w-4" /> : <PowerOff className="h-4 w-4" />}
                    </button>
                    <button
                      onClick={() => deleteKey(k.id, k.label)}
                      className="p-1.5 rounded-lg text-error/70 hover:text-error hover:bg-error-container/30 transition-all"
                      title="Delete key"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {/* Empty state */}
      {keys.length === 0 && !loading && !error && (
        <div className="text-center py-10">
          <Cpu className="h-10 w-10 mx-auto text-outline mb-3" />
          <p className="text-sm text-on-surface-variant">No LLM keys configured yet.</p>
          <p className="text-xs text-on-surface-variant mt-1">
            Add your OpenRouter key (primary) or an OpenAI key (paid last resort) to enable AI scoring.
          </p>
          <button onClick={() => setShowAddForm(true)} className="btn-primary text-xs mt-4">
            <Plus className="h-3.5 w-3.5" /> Add your first key
          </button>
        </div>
      )}

      {/* === Add Key Modal === */}
      {showAddForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-on-background/40 backdrop-blur-sm"
          onClick={() => setShowAddForm(false)}
        >
          <div className="glass-card w-full max-w-md p-6 space-y-4 animate-fade-in" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-headline font-semibold text-on-background text-lg">
              Add LLM Provider Key
            </h3>

            {/* Provider select */}
            <div>
              <label className="text-xs font-medium text-on-surface-variant block mb-1">Provider</label>
              <PremiumSelect
                value={newProvider}
                onChange={(v) => {
                  setNewProvider(v);
                  const b = budgets[v];
                  setNewDailyLimit(b?.defaultDailyLimit ?? 1_000_000);
                }}
                aria-label="LLM provider"
                options={Object.entries(PROVIDER_LABELS).map(([value, label]) => ({
                  value,
                  label: `${label} — ${PROVIDER_FREE_LIMITS[value] ?? ''}`,
                }))}
              />
            </div>

            {/* API Key */}
            <div>
              <label className="text-xs font-medium text-on-surface-variant block mb-1">API Key</label>
              <input
                type="password"
                value={newApiKey}
                onChange={(e) => setNewApiKey(e.target.value)}
                placeholder={newProvider === 'openrouter' ? 'sk-or-...' : newProvider === 'cerebras' ? 'csk-...' : newProvider === 'groq' ? 'gsk_...' : 'sk-...'}
                className="input w-full font-mono text-sm"
                autoComplete="off"
              />
            </div>

            {/* Label */}
            <div>
              <label className="text-xs font-medium text-on-surface-variant block mb-1">
                Label <span className="text-outline">(optional)</span>
              </label>
              <input
                type="text"
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                placeholder="e.g. OpenRouter Key #1"
                className="input w-full text-sm"
              />
            </div>

            {/* Daily limit */}
            <div>
              <label className="text-xs font-medium text-on-surface-variant block mb-1">
                Daily limit ({budgets[newProvider]?.limitLabel ?? 'tokens/day'})
              </label>
              <input
                type="number"
                value={newDailyLimit}
                onChange={(e) => setNewDailyLimit(Number(e.target.value))}
                className="input w-full text-sm"
              />
              <p className="text-[10px] text-on-surface-variant mt-1">
                {budgets[newProvider]?.freeTierNote ||
                  'When this key hits this limit, the system rotates to the next key.'}
              </p>
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setShowAddForm(false)}
                className="btn text-xs"
              >
                Cancel
              </button>
              <button
                onClick={addKey}
                disabled={saving || !newApiKey.trim()}
                className="btn-primary text-xs"
              >
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                Add Key
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
