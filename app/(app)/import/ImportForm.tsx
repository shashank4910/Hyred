'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Link2, Loader2, Sparkles, ChevronDown, ChevronRight, AlertCircle } from 'lucide-react';

export function ImportForm() {
  const router = useRouter();
  const [url, setUrl] = useState('');
  const [manualOpen, setManualOpen] = useState(false);
  const [manualTitle, setManualTitle] = useState('');
  const [manualCompany, setManualCompany] = useState('');
  const [manualJd, setManualJd] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);
    if (!url.trim()) { toast.error('Paste a job URL first'); return; }
    setSubmitting(true);
    const id = toast.loading(manualJd ? 'Saving and scoring...' : 'Fetching & scoring...');
    try {
      const res = await fetch('/api/import-job', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url: url.trim(), manual_title: manualTitle.trim() || undefined, manual_company: manualCompany.trim() || undefined, manual_jd: manualJd.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.needs_manual) { setManualOpen(true); setErrorMsg(data.error || 'Could not fetch automatically.'); toast.dismiss(id); toast.warning('Auto-fetch failed. Paste JD below.', { duration: 6000 }); return; }
        throw new Error(data.error || 'Import failed');
      }
      toast.success(`Imported! Score: ${data.score}/100`, { id });
      setUrl(''); setManualTitle(''); setManualCompany(''); setManualJd(''); setManualOpen(false);
      router.push(`/jobs/${data.match_id}`);
    } catch (e) { toast.error((e as Error).message, { id }); }
    finally { setSubmitting(false); }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="card">
        <label className="text-caption text-stone font-medium block mb-2">Job posting URL</label>
        <div className="relative">
          <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-shadow-tint" />
          <input type="url" required value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://www.naukri.com/job-listings-..." className="input pl-9" autoFocus />
        </div>
        <p className="text-caption text-stone mt-2">
          Works with Naukri, Wellfound, Indeed, Greenhouse, Lever, Workable, and most career pages.
        </p>
      </div>

      {errorMsg && (
        <div className="card border-l-4 border-l-warning-red bg-red-50/50">
          <div className="flex items-start gap-2 text-body-sm text-warning-red">
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        </div>
      )}

      <div className="card">
        <button type="button" onClick={() => setManualOpen((v) => !v)} className="flex items-center gap-2 text-body-sm text-stone hover:text-ink w-full transition-colors">
          {manualOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          Paste JD manually (for LinkedIn or login-walled sites)
        </button>
        {manualOpen && (
          <div className="space-y-4 mt-5 animate-fade-in">
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="text-caption text-stone font-medium block mb-1">Title (optional)</label>
                <input className="input" value={manualTitle} onChange={(e) => setManualTitle(e.target.value)} placeholder="Senior Performance Engineer" />
              </div>
              <div>
                <label className="text-caption text-stone font-medium block mb-1">Company (optional)</label>
                <input className="input" value={manualCompany} onChange={(e) => setManualCompany(e.target.value)} placeholder="Stripe" />
              </div>
            </div>
            <div>
              <label className="text-caption text-stone font-medium block mb-1">Job description</label>
              <textarea className="input min-h-[200px] text-caption font-mono" value={manualJd} onChange={(e) => setManualJd(e.target.value)} placeholder="Paste the full JD here..." />
              <p className="text-caption text-stone mt-1">{manualJd.length} chars (need at least 100)</p>
            </div>
          </div>
        )}
      </div>

      <div className="flex justify-end">
        <button type="submit" disabled={submitting || !url.trim()} className="btn-primary">
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {submitting ? 'Working...' : 'Import + Score'}
        </button>
      </div>
    </form>
  );
}
