'use client';

import { useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import {
  Bell,
  BellRing,
  Building2,
  Globe,
  Loader2,
  Mail,
  MessageSquare,
  PenLine,
  Plus,
  Search,
  Send,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { PageHeader } from '../_components/PageHeader';
import PremiumSelect from '@/app/_components/ui/PremiumSelect';
import type { DreamCompanyRow } from '@/lib/dream-companies';
import { CompanyLogo } from '../_components/CompanyLogo';

type CatalogItem = {
  key: string;
  name: string;
  region: string;
  region_label: string;
  source_label: string;
  is_listed: boolean;
  exchange?: string | null;
  patterns: string[];
};

type RegionOption = { id: string; label: string };

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
  regions: RegionOption[];
  catalogTotal: number;
  limit: number;
  used: number;
  unread: number;
};

export function DreamAlertsClient({
  initialPicks,
  initialAlerts,
  catalog,
  regions,
  catalogTotal,
  limit,
  used: initialUsed,
  unread: initialUnread,
}: Props) {
  const [picks, setPicks] = useState(initialPicks);
  const [alerts, setAlerts] = useState(initialAlerts);
  const [used, setUsed] = useState(initialUsed);
  const [unread, setUnread] = useState(initialUnread);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerTab, setPickerTab] = useState<'catalog' | 'manual' | 'request'>('catalog');
  const [busy, setBusy] = useState<string | null>(null);

  const [query, setQuery] = useState('');
  const [region, setRegion] = useState('');

  const [manualName, setManualName] = useState('');
  const [requestName, setRequestName] = useState('');
  const [requestNote, setRequestNote] = useState('');

  const pickedKeys = useMemo(() => new Set(picks.map((p) => p.company_key)), [picks]);

  const catalogResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = catalog.filter((c) => !pickedKeys.has(c.key));
    if (region) list = list.filter((c) => c.region === region);
    if (q) {
      list = list.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.key.includes(q) ||
          c.patterns.some((p) => p.includes(q)),
      );
    }
    return list.slice(0, 60);
  }, [catalog, query, region, pickedKeys]);

  const addFromCatalog = async (companyKey: string) => {
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
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const addManual = async () => {
    const name = manualName.trim();
    if (name.length < 2) {
      toast.error('Enter a company name');
      return;
    }
    setBusy('manual');
    try {
      const res = await fetch('/api/dream-companies', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ custom_name: name }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not add');
      setPicks((prev) => [...prev, data.pick as DreamCompanyRow]);
      setUsed((u) => u + 1);
      toast.success(`Tracking ${name} (manual match)`);
      setManualName('');
      setPickerOpen(false);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const submitRequest = async () => {
    const name = requestName.trim();
    if (name.length < 2) {
      toast.error('Enter a company name');
      return;
    }
    setBusy('request');
    try {
      const res = await fetch('/api/dream-companies/request', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ requested_name: name, note: requestNote.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Request failed');
      toast.success(data.message ?? 'Request submitted');
      setRequestName('');
      setRequestNote('');
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const removeCompany = async (id: string, name: string) => {
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
  };

  const toggleEmail = async (pick: DreamCompanyRow) => {
    setBusy(pick.id);
    try {
      const res = await fetch('/api/dream-companies', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: pick.id, notify_email: !pick.notify_email }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Update failed');
      setPicks((prev) => prev.map((p) => (p.id === pick.id ? (data.pick as DreamCompanyRow) : p)));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const markAlertRead = async (alertId: string) => {
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
  };

  const atLimit = used >= limit;

  return (
    <div className="space-y-8">
      <PageHeader
        title="Dream company alerts"
        description={`Search ${catalogTotal.toLocaleString()}+ listed and major unlisted companies. Pick from the catalog, add a name, or request a listing.`}
        action={
          unread > 0 ? (
            <p className="rounded-full bg-lime-brand px-4 py-2 text-sm font-semibold text-ink">
              {unread} new alert{unread === 1 ? '' : 's'}
            </p>
          ) : null
        }
      />

      <div className="grid gap-8 lg:grid-cols-5">
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
                Add from the global catalog or type any company name manually.
              </p>
            </div>
          ) : (
            <ul className="space-y-2">
              {picks.map((pick) => (
                <li
                  key={pick.id}
                  className="flex items-center gap-3 rounded-2xl border border-outline-variant/60 bg-surface-container-lowest px-4 py-3 shadow-sm"
                >
                  <CompanyLogo name={pick.company_display_name} size={36} tileClassName="rounded-xl" />
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-on-surface truncate">{pick.company_display_name}</p>
                    <p className="text-[10px] text-on-surface-variant capitalize">
                      {pick.source === 'manual' ? 'Manual match' : 'Catalog'}
                      {' · '}
                      <button
                        type="button"
                        onClick={() => toggleEmail(pick)}
                        disabled={busy === pick.id}
                        className="hover:text-primary"
                      >
                        Email {pick.notify_email ? 'on' : 'off'}
                      </button>
                    </p>
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
            onClick={() => {
              setPickerOpen(true);
              setPickerTab('catalog');
            }}
            disabled={atLimit}
            className="btn-primary w-full justify-center gap-2 disabled:opacity-50"
          >
            <Plus className="h-4 w-4" />
            {atLimit ? `Limit reached (${limit})` : 'Add dream company'}
          </button>
        </section>

        <section className="lg:col-span-3 space-y-4">
          <h2 className="text-title-md font-bold text-on-surface">Recent alerts</h2>
          {alerts.length === 0 ? (
            <div className="rounded-2xl border border-outline-variant/60 bg-surface-container-lowest p-8 text-center">
              <Bell className="mx-auto h-10 w-10 text-on-surface-variant/50 mb-3" />
              <p className="text-sm text-on-surface-variant max-w-sm mx-auto">
                Alerts appear when a scan finds a job matching your dream companies.
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
                          <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-primary">
                            <CompanyLogo name={alert.dream_company.company_display_name} size={14} />
                            {alert.dream_company.company_display_name}
                          </p>
                          <p className="font-semibold text-on-surface truncate mt-0.5">
                            {alert.job_title ?? 'New role'}
                          </p>
                        </div>
                        {isNew && (
                          <span className="shrink-0 rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold text-on-primary">
                            New
                          </span>
                        )}
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      {pickerOpen && (
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4">
          <button
            type="button"
            className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm"
            onClick={() => setPickerOpen(false)}
            aria-label="Close"
          />
          <div className="relative z-10 flex max-h-[88vh] w-full max-w-lg flex-col rounded-t-2xl sm:rounded-2xl border border-outline-variant bg-surface-container-lowest shadow-elevated">
            <div className="flex items-center justify-between border-b border-outline-variant px-4 py-3">
              <h3 className="font-semibold text-on-surface">Add dream company</h3>
              <button type="button" onClick={() => setPickerOpen(false)} className="btn p-2">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex border-b border-outline-variant text-xs font-semibold">
              {(
                [
                  ['catalog', 'Catalog', Globe],
                  ['manual', 'Manual', PenLine],
                  ['request', 'Request', Send],
                ] as const
              ).map(([id, label, Icon]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setPickerTab(id)}
                  className={[
                    'flex flex-1 items-center justify-center gap-1.5 py-2.5',
                    pickerTab === id
                      ? 'border-b-2 border-primary text-primary'
                      : 'text-on-surface-variant',
                  ].join(' ')}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {label}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              {pickerTab === 'catalog' && (
                <div className="space-y-3">
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-on-surface-variant" />
                      <input
                        type="search"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Search 500+ companies…"
                        className="input w-full pl-10"
                        autoFocus
                      />
                    </div>
                    <PremiumSelect
                      compact
                      value={region}
                      onChange={setRegion}
                      aria-label="Filter companies by region"
                      className="shrink-0 max-w-[130px]"
                      options={[
                        { value: '', label: 'All regions' },
                        ...regions.map((r) => ({ value: r.id, label: r.label })),
                      ]}
                    />
                  </div>
                  <div className="flex flex-wrap gap-2 max-h-[45vh] overflow-y-auto">
                      {catalogResults.map((c) => (
                        <button
                          key={c.key}
                          type="button"
                          disabled={busy === c.key}
                          onClick={() => addFromCatalog(c.key)}
                          className="rounded-xl border border-outline-variant bg-surface-container-low px-3 py-2 text-left text-sm hover:border-primary hover:bg-primary/5 disabled:opacity-50 max-w-full"
                        >
                          <span className="font-medium block truncate">{c.name}</span>
                          <span className="text-[10px] text-on-surface-variant">
                            {c.region_label}
                            {c.exchange ? ` · ${c.exchange}` : ''}
                            {!c.is_listed ? ' · Private' : ''}
                          </span>
                        </button>
                      ))}
                      {catalogResults.length === 0 && (
                        <p className="text-sm text-on-surface-variant py-4 w-full text-center">
                          No matches — try Manual add or Request listing.
                        </p>
                      )}
                  </div>
                </div>
              )}

              {pickerTab === 'manual' && (
                <div className="space-y-3">
                  <p className="text-sm text-on-surface-variant">
                    Type any employer name. We match jobs when the company field contains that name
                    (word-safe). Only you see this pick unless you also request a global listing.
                  </p>
                  <input
                    type="text"
                    value={manualName}
                    onChange={(e) => setManualName(e.target.value)}
                    placeholder="e.g. Acme Corp India"
                    className="input w-full"
                    maxLength={120}
                  />
                  <button
                    type="button"
                    onClick={addManual}
                    disabled={busy === 'manual' || atLimit}
                    className="btn-primary w-full justify-center gap-2"
                  >
                    {busy === 'manual' ? <Loader2 className="h-4 w-4 animate-spin" /> : <PenLine className="h-4 w-4" />}
                    Add manually
                  </button>
                </div>
              )}

              {pickerTab === 'request' && (
                <div className="space-y-3">
                  <p className="text-sm text-on-surface-variant">
                    Ask us to add a company to the global catalog for all users. Admin reviews
                    requests — you can still track it manually today.
                  </p>
                  <input
                    type="text"
                    value={requestName}
                    onChange={(e) => setRequestName(e.target.value)}
                    placeholder="Company name"
                    className="input w-full"
                    maxLength={120}
                  />
                  <textarea
                    value={requestNote}
                    onChange={(e) => setRequestNote(e.target.value)}
                    placeholder="Optional note (ticker, country…)"
                    className="input w-full min-h-[72px] resize-y text-sm"
                    maxLength={500}
                  />
                  <button
                    type="button"
                    onClick={submitRequest}
                    disabled={busy === 'request'}
                    className="btn w-full justify-center gap-2 border border-primary text-primary hover:bg-primary/5"
                  >
                    {busy === 'request' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    Submit request
                  </button>
                </div>
              )}
            </div>

            <div className="border-t border-outline-variant px-4 py-2 text-center text-[11px] text-on-surface-variant">
              <Mail className="inline h-3 w-3 mr-1" />
              Email alerts coming soon · SMS on premium later
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
