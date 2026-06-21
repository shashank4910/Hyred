'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Building2, Check, Loader2, X } from 'lucide-react';

type RequestRow = {
  id: string;
  requested_name: string;
  note: string | null;
  created_at: string;
  profiles?: { email: string; full_name: string | null } | { email: string; full_name: string | null }[];
};

export function CompanyCatalogRequestsPanel() {
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/company-catalog/requests');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load');
      setRequests(data.requests ?? []);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function review(id: string, action: 'approve' | 'reject') {
    setBusy(id);
    try {
      const res = await fetch('/api/admin/company-catalog/requests', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id, action, region: 'global' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      toast.success(action === 'approve' ? 'Added to global catalog' : 'Request rejected');
      setRequests((prev) => prev.filter((r) => r.id !== id));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="glass-card p-6 space-y-4">
      <div className="flex items-center gap-2">
        <Building2 className="h-5 w-5 text-primary" />
        <h2 className="text-title-md font-bold text-on-surface">Dream company catalog requests</h2>
      </div>
      <p className="text-sm text-on-surface-variant">
        Users can request companies for the global catalog (Tier C). Approve to add for everyone.
      </p>
      {loading ? (
        <div className="flex justify-center py-6">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : requests.length === 0 ? (
        <p className="text-sm text-on-surface-variant py-4">No pending requests.</p>
      ) : (
        <ul className="space-y-2">
          {requests.map((r) => {
            const prof = Array.isArray(r.profiles) ? r.profiles[0] : r.profiles;
            return (
              <li
                key={r.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-outline-variant px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="font-semibold text-on-surface">{r.requested_name}</p>
                  <p className="text-[11px] text-on-surface-variant">
                    {prof?.email ?? 'user'}
                    {r.note ? ` · ${r.note}` : ''}
                  </p>
                </div>
                <div className="flex gap-1">
                  <button
                    type="button"
                    disabled={busy === r.id}
                    onClick={() => review(r.id, 'approve')}
                    className="btn p-2 text-match-success hover:bg-match-success/10"
                    title="Approve"
                  >
                    {busy === r.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  </button>
                  <button
                    type="button"
                    disabled={busy === r.id}
                    onClick={() => review(r.id, 'reject')}
                    className="btn p-2 text-error hover:bg-error/10"
                    title="Reject"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
