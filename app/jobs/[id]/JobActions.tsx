'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

const STATUSES = [
  'new',
  'saved',
  'applied',
  'interviewing',
  'offer',
  'rejected',
  'closed',
] as const;

export function JobActions({
  matchId,
  status,
  coverLetter,
}: {
  matchId: string;
  status: string;
  coverLetter: string | null;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [letter, setLetter] = useState(coverLetter ?? '');
  const [generating, setGenerating] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [copied, setCopied] = useState(false);

  async function generate() {
    setGenerating(true);
    try {
      const res = await fetch(`/api/coverletter`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ match_id: matchId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      setLetter(data.cover_letter);
      startTransition(() => router.refresh());
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setGenerating(false);
    }
  }

  async function setStatus(next: string) {
    setUpdating(true);
    try {
      await fetch(`/api/match/${matchId}/status`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: next }),
      });
      startTransition(() => router.refresh());
    } finally {
      setUpdating(false);
    }
  }

  async function copy() {
    await navigator.clipboard.writeText(letter);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="space-y-3">
      <div className="card">
        <h2 className="font-semibold mb-3">Track this</h2>
        <div className="flex flex-wrap gap-2">
          {STATUSES.map((s) => (
            <button
              key={s}
              disabled={updating || s === status}
              onClick={() => setStatus(s)}
              className={
                s === status
                  ? 'rounded-full bg-primary text-bg px-3 py-1 text-xs font-semibold'
                  : 'rounded-full border border-border px-3 py-1 text-xs text-muted hover:text-primary hover:border-primary/40'
              }
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-semibold">Cover letter</h2>
          <div className="flex gap-2">
            {letter && (
              <button onClick={copy} className="btn">
                {copied ? 'Copied' : 'Copy'}
              </button>
            )}
            <button onClick={generate} disabled={generating} className="btn-primary">
              {generating ? 'Generating...' : letter ? 'Regenerate' : 'Generate'}
            </button>
          </div>
        </div>
        {letter ? (
          <pre className="whitespace-pre-wrap text-sm text-[#cbd5e1] font-sans">
            {letter}
          </pre>
        ) : (
          <p className="text-sm text-muted">
            Click Generate to create a tailored cover letter using your resume.
          </p>
        )}
      </div>
    </div>
  );
}
