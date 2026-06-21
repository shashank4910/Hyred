'use client';

import { useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import {
  Bell,
  BellRing,
  Building2,
  Loader2,
  Mail,
  MessageSquare,
  Plus,
  Search,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import type { DreamCompanyRow } from '@/lib/dream-companies';
import type { CompanyEntry } from '@/lib/top-companies';

type CatalogItem = {
  key: string;
  name: string;
  category: CompanyEntry['category'];
  category_label: string;
};

type AlertItem = {
  id: string;
  job_id: string;
  match_id: string | null;
  job_title: string | null;
  company_name: string | null;
  read_at: string | null;
  created_at: string;
  dream_company: { company_display_name: string; company_key: string };
};

type Props = {
  initialPicks: DreamCompanyRow[];
  initialAlerts: AlertItem[];
  catalog: CatalogItem[];
  limit: number;
  used: number;
  unread: number;
};

export function DreamAlertsClient({
  initialPicks,
  initialAlerts,
  catalog,
  limit,
  used: initialUsed,
  unread: initialUnread,
}: Props) {
  const [picks, setPicks] = useState(initialPicks);
  const [alerts, setAlerts] = useState(initialAlerts);
  const [used, setUsed] = useState(initialUsed);
  const [unread, setUnread] = useState(initialUnread);
  const [query, setQuery] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const pickedKeys = useMemo(() => new Set(picks.map((p) => p.company_key)), [picks]);

  const filteredCatalog = useMemo(() => {
    const q = query.trim().toLowerCase();
    return catalog.filter((c) => {
      if (pickedKeys.has(c.key)) return false;
      if (!q) return true;
      return c.name.toLowerCase().includes(q) || c.category_label.toLowerCase().includes(q);
    });
  }, [catalog, pickedKeys, query]);

  const groupedCatalog = useMemo(() => {
    const groups = new Map<string, CatalogItem[]>();
    for (const item of filteredCatalog.slice(0, 80)) {
      const label = item.category_label;
      if (!groups.has(label)) groups.set(label, []);
      groups.get(label)!.push(item);
    }
    return groups;
  }, [filteredCatalog]);

  const addCompany = useCallback(
    async (companyKey: string) => {
      setBusy(companyKey);
      try {
        const res = await fetch('/api/dream-companies', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ company_key: companyKey }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Could not add company');
        setPicks((prev) => [...prev, data.pick as DreamCompanyRow]);
        setUsed((u) => u + 1);
        toast.success(`Now tracking ${data.pick.company_display_name}`);
        setPickerOpen(false);
        setQuery('');
      } catch (e) {
        toast.error((e as Error).message);
      } finally {
        setBusy(null);
      }
    },
    [],
  );

  const removeCompany = useCallback(async (id: string, name: string) => {
    setBusy(id);
    try {
      const res = await fetch(`/api/dream-companies/${id}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not remove');
      setPicks((prev) => prev.filter((p) => p.id !== id));
      setUsed((u) => Math.max(0, u - 1));
      toast.success(`Stopped tracking ${name}`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }, []);

  const toggleEmail = useCallback(async (pick: DreamCompanyRow) => {
    setBusy(pick.id);
    try {
      const res = await fetch('/api/dream-companies', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: pick.id, notify_email: !pick.notify_email }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Update failed');
      setPicks((prev) =>
        prev.map((p) => (p.id === pick.id ? (data.pick as DreamCompanyRow) : p)),
      );
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }, []);

  const markAlertRead = useCallback(async (alertId: string) => {
    setAlerts((prev) =>
      prev.map((a) =>
        a.id === alertId ? { ...a, read_at: a.read_at ?? new Date().toISOString() } : a,
      ),
    );
    setUnread((u) => Math.max(0, u - 1));
    await fetch('/api/dream-companies/alerts', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ alert_ids: [alertId] }),
    }).catch(() => {});
  }, []);

  const atLimit = used >= limit;

  return (
    <div className="space-y-8">
      {/* Hero */}
      <div className="glass-card p-6 sm:p-8 relative overflow-hidden">
        <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-primary/10 blur-2xl" />
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2 max-w-2xl">
            <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-bold uppercase tracking-wide text-primary">
              <BellRing className="h-3.5 w-3.5" />
              Dream company alerts
            </div>
            <h1 className="font-headline text-headline-md font-bold text-on-background">
              Never miss your dream company
            </h1>
            <p className="text-body-md text-on-surface-variant leading-relaxed">
              Pick the companies you care about most. When Hyred finds a new role from them in any
              scan, you&apos;ll see an alert here — email and SMS coming soon.
            </p>
          </div>
          {unread > 0 && (
            <div className="flex items-center gap-2 rounded-2xl bg-secondary-container/40 px-4 py-2 text-sm font-semibold text-secondary">
              <Sparkles className="h-4 w-4" />
              {unread} new alert{unread === 1 ? '' : 's'}
            </div>
          )}
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-5">
        {/* Dream picks */}
        <section className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-title-md font-bold text-on-surface">Your dream companies</h2>
            <span className="text-xs font-medium text-on-surface-variant">
              {used}/{limit}
            </span>
          </div>

          {picks.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-outline-variant bg-surface-container-low/50 p-6 text-center">
              <Building2 className="mx-auto h-8 w-8 text-on-surface-variant/60 mb-2" />
              <p className="text-sm text-on-surface-variant">
                No companies yet. Add Google, Microsoft, or any company from our catalog.
              </p>
            </div>
          ) : (
            <ul className="space-y-2">
              {picks.map((pick) => (
                <li
                  key={pick.id}
                  className="flex items-center gap-3 rounded-2xl border border-outline-variant/60 bg-surface-container-lowest px-4 py-3 shadow-sm"
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary font-bold text-sm">
                    {pick.company_display_name.slice(0, 1)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-on-surface truncate">{pick.company_display_name}</p>
                    <button
                      type="button"
                      onClick={() => toggleEmail(pick)}
                      disabled={busy === pick.id}
                      className="mt-0.5 flex items-center gap-1 text-[11px] text-on-surface-variant hover:text-primary"
                    >
                      <Mail className="h-3 w-3" />
                      Email {pick.notify_email ? 'on' : 'off'}
                      <span className="text-on-surface-variant/50">· SMS soon</span>
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeCompany(pick.id, pick.company_display_name)}
                    disabled={busy === pick.id}
                    className="btn p-2 text-on-surface-variant hover:text-error"
                    aria-label={`Remove ${pick.company_display_name}`}
                  >
                    {busy === pick.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}

          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            disabled={atLimit}
            className="btn-primary w-full justify-center gap-2 disabled:opacity-50"
          >
            <Plus className="h-4 w-4" />
            {atLimit ? `Limit reached (${limit})` : 'Add dream company'}
          </button>
          {atLimit && limit === 1 && (
            <p className="text-xs text-center text-on-surface-variant">
              Premium unlocks up to 10 dream companies + instant email alerts (coming soon).
            </p>
          )}
        </section>

        {/* Alert feed */}
        <section className="lg:col-span-3 space-y-4">
          <h2 className="text-title-md font-bold text-on-surface">Recent alerts</h2>
          {alerts.length === 0 ? (
            <div className="rounded-2xl border border-outline-variant/60 bg-surface-container-lowest p-8 text-center">
              <Bell className="mx-auto h-10 w-10 text-on-surface-variant/50 mb-3" />
              <p className="text-sm text-on-surface-variant max-w-sm mx-auto">
                Alerts appear here when a scan finds a new job from one of your dream companies.
                Run a scan or wait for the next scheduled ingest.
              </p>
            </div>
          ) : (
            <ul className="space-y-2">
              {alerts.map((alert) => {
                const isNew = !alert.read_at;
                const href = alert.match_id ? `/jobs/${alert.match_id}` : '/';
                return (
                  <li key={alert.id}>
                    <Link
                      href={href}
                      onClick={() => isNew && markAlertRead(alert.id)}
                      className={[
                        'block rounded-2xl border px-4 py-3 transition-all hover:shadow-card',
                        isNew
                          ? 'border-primary/40 bg-primary/5 ring-1 ring-primary/20'
                          : 'border-outline-variant/60 bg-surface-container-lowest',
                      ].join(' ')}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-xs font-bold uppercase tracking-wide text-primary">
                            {alert.dream_company.company_display_name}
                          </p>
                          <p className="font-semibold text-on-surface truncate mt-0.5">
                            {alert.job_title ?? 'New role'}
                          </p>
                          {alert.company_name && (
                            <p className="text-xs text-on-surface-variant truncate">
                              {alert.company_name}
                            </p>
                          )}
                        </div>
                        {isNew && (
                          <span className="shrink-0 rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold text-on-primary">
                            New
                          </span>
                        )}
                      </div>
                      <p className="mt-2 text-[10px] text-on-surface-variant">
                        {new Date(alert.created_at).toLocaleString()}
                      </p>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      {/* Company picker modal */}
      {pickerOpen && (
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4">
          <button
            type="button"
            className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm"
            onClick={() => setPickerOpen(false)}
            aria-label="Close picker"
          />
          <div className="relative z-10 flex max-h-[85vh] w-full max-w-lg flex-col rounded-t-2xl sm:rounded-2xl border border-outline-variant bg-surface-container-lowest shadow-elevated">
            <div className="flex items-center justify-between border-b border-outline-variant px-4 py-3">
              <h3 className="font-semibold text-on-surface">Pick a company</h3>
              <button type="button" onClick={() => setPickerOpen(false)} className="btn p-2">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="border-b border-outline-variant px-4 py-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-on-surface-variant" />
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search Google, TCS, Amazon…"
                  className="input w-full pl-10"
                  autoFocus
                />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {[...groupedCatalog.entries()].map(([category, items]) => (
                <div key={category}>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant mb-2">
                    {category}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {items.map((c) => (
                      <button
                        key={c.key}
                        type="button"
                        disabled={busy === c.key}
                        onClick={() => addCompany(c.key)}
                        className="rounded-xl border border-outline-variant bg-surface-container-low px-3 py-2 text-sm font-medium text-on-surface hover:border-primary hover:bg-primary/5 disabled:opacity-50"
                      >
                        {busy === c.key ? (
                          <Loader2 className="h-4 w-4 animate-spin inline" />
                        ) : (
                          c.name
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
              {groupedCatalog.size === 0 && (
                <p className="text-sm text-center text-on-surface-variant py-8">
                  No companies match your search.
                </p>
              )}
            </div>
            <div className="border-t border-outline-variant px-4 py-2 text-center text-[11px] text-on-surface-variant">
              <MessageSquare className="inline h-3 w-3 mr-1" />
              SMS alerts — premium, coming in a later update
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
