'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import {
  Brain,
  Loader2,
  Lock,
  RotateCw,
  CheckCircle2,
  ExternalLink,
  FileText,
  Users,
} from 'lucide-react';
import type { MatchIntelligenceResult } from '@/lib/types';

function sectionHref(jobHref: string, section: string) {
  return `${jobHref}#${section}`;
}

export function MatchIntelligencePanel({
  matchId,
  jobHref,
}: {
  matchId: string;
  jobHref: string;
}) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<MatchIntelligenceResult | null>(null);
  const [locked, setLocked] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/match/${matchId}/verdict`)
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        setLocked(Boolean(d.locked));
        setResult(d.result ?? null);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [matchId]);

  async function generate() {
    setLoading(true);
    const tid = toast.loading('Analyzing this match...');
    try {
      const res = await fetch(`/api/match/${matchId}/verdict`, { method: 'POST' });
      const data = await res.json();
      if (res.status === 402) {
        toast.error('Premium upgrade required to unlock Match Intelligence.', { id: tid });
        setLocked(true);
        return;
      }
      if (!res.ok) throw new Error(data.error || 'Could not generate verdict');
      setResult(data.result);
      setLocked(false);
      toast.success('Match Intelligence ready', { id: tid });
    } catch (e) {
      toast.error((e as Error).message, { id: tid });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-semibold text-on-surface flex items-center gap-2">
            <Brain className="h-4 w-4 text-primary" /> Match Intelligence
          </h2>
          <p className="text-xs text-on-surface-variant mt-0.5">
            Apply, Stretch, or Skip — with seniority fit and next steps.
          </p>
        </div>
        {!result && (
          <button onClick={generate} disabled={loading} className="btn-primary">
            {loading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Lock className="h-3.5 w-3.5" />
            )}
            {loading ? 'Analyzing…' : 'Unlock verdict'}
          </button>
        )}
      </div>

      {locked && !result && !loading && (
        <div className="mt-3 rounded-xl border border-outline-variant bg-surface-container-low p-4 text-sm text-on-surface-variant flex items-center gap-2">
          <Lock className="h-4 w-4 shrink-0 text-on-surface-variant/60" />
          Apply / Stretch / Skip is a Premium feature. Upgrade to unlock instant verdict on every match.
        </div>
      )}

      {result && (
        <div className="mt-4 space-y-3">
          <div className="flex items-center gap-3 flex-wrap">
            <span
              className={[
                'rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide',
                result.verdict === 'apply'
                  ? 'bg-match-success/15 text-match-success'
                  : result.verdict === 'skip'
                    ? 'bg-error/15 text-error'
                    : 'bg-warning/15 text-warning',
              ].join(' ')}
            >
              {result.verdict}
            </span>
            <span className="text-xs text-on-surface-variant">
              Seniority fit:{' '}
              <span className="font-medium text-on-surface">{result.seniorityFit}</span>
            </span>
            <button
              onClick={generate}
              disabled={loading}
              className="btn text-xs ml-auto"
              title="Refresh verdict"
            >
              {loading ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <RotateCw className="h-3 w-3" />
              )}
            </button>
          </div>

          {result.reasons.length > 0 && (
            <div>
              <p className="text-xs font-medium text-on-surface mb-1.5">Why</p>
              <ul className="space-y-1">
                {result.reasons.map((r, i) => (
                  <li key={i} className="text-sm text-on-surface-variant flex gap-2">
                    <span className="text-primary mt-0.5">•</span> {r}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {result.actions.length > 0 && (
            <div>
              <p className="text-xs font-medium text-on-surface mb-1.5">Recommended actions</p>
              <ul className="space-y-1">
                {result.actions.map((a, i) => (
                  <li key={i} className="text-sm text-on-surface-variant flex gap-2">
                    <CheckCircle2 className="h-3.5 w-3.5 text-match-success mt-0.5 shrink-0" /> {a}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <div className="mt-5 pt-5 border-t border-outline-variant/40">
        <p className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant mb-3">
          Next steps
        </p>
        <div className="flex flex-wrap gap-2">
          <Link href={sectionHref(jobHref, 'apply')} className="btn-primary inline-flex gap-1.5 text-sm">
            <ExternalLink className="h-4 w-4" />
            Apply for this role
          </Link>
          <Link href={sectionHref(jobHref, 'ats-resume')} className="btn inline-flex gap-1.5 text-sm">
            <FileText className="h-4 w-4" />
            Optimize my resume for ATS
          </Link>
          <Link href={sectionHref(jobHref, 'referral')} className="btn inline-flex gap-1.5 text-sm">
            <Users className="h-4 w-4" />
            Find a referral
          </Link>
        </div>
        <p className="text-[11px] text-on-surface-variant mt-2">
          Opens the full job page with apply, resume studio, and referral tools.
        </p>
      </div>
    </div>
  );
}
