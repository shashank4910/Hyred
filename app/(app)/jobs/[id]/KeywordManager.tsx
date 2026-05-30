'use client';

import { useMemo } from 'react';
import {
  CheckCircle2,
  Plus,
  X,
  Sparkles,
  Loader2,
  Zap,
  TrendingUp,
  TrendingDown,
} from 'lucide-react';

export type GenResult = {
  added: string[];
  already_had: string[];
  missing: string[];
  total_jd_keywords: number;
  ats_match_score: number;
} | null;

/**
 * The single ATS-keyword surface. Same layout before AND after optimizing — only
 * the chips change colour/bucket. Four buckets, derived purely from:
 *   - jdKeywords     : the stable JD keyword universe
 *   - originalPresent: keywords already in the master resume (never changes)
 *   - result         : the last generation's added / already_had / missing
 *   - staged         : what the user currently wants woven in (their intent)
 *
 * Buckets:
 *   IN YOUR RESUME      green, read-only     present AND in the master resume
 *   ADDED               green, click to undo present, not original, still wanted
 *   WILL BE ADDED NEXT  amber, click to undo staged but not yet in the resume
 *   MISSING             red,   click to add  everything else (incl. pending removals)
 *
 * "Pending" = staged-but-not-present (add) OR present-woven-but-unstaged (remove).
 * When anything is pending we show a banner + an active Optimize button.
 */
export function KeywordManager({
  jdKeywords,
  originalPresent,
  result,
  staged,
  generating,
  hasResume,
  scoreDelta,
  onStage,
  onUnstage,
  onStageMany,
  onOptimize,
}: {
  jdKeywords: string[];
  originalPresent: string[];
  result: GenResult;
  staged: string[];
  generating: boolean;
  hasResume: boolean;
  scoreDelta: number | null;
  onStage: (kw: string) => void;
  onUnstage: (kw: string) => void;
  onStageMany: (kws: string[]) => void;
  onOptimize: () => void;
}) {
  const originalSet = useMemo(
    () => new Set(originalPresent.map((k) => k.toLowerCase())),
    [originalPresent],
  );
  const stagedSet = useMemo(
    () => new Set(staged.map((k) => k.toLowerCase())),
    [staged],
  );
  // Keywords present in the CURRENT resume. Before the first optimize there is
  // no result yet, so "present" == what's already in the master resume.
  const presentSet = useMemo(() => {
    if (!result) return originalSet;
    const s = new Set<string>();
    for (const k of result.added) s.add(k.toLowerCase());
    for (const k of result.already_had) s.add(k.toLowerCase());
    return s;
  }, [result, originalSet]);

  // The universe is the JD keywords plus anything the user staged (defensive:
  // covers a staged keyword that isn't in the JD list).
  const universe = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const k of [...jdKeywords, ...staged]) {
      const lc = k.toLowerCase();
      if (!seen.has(lc)) {
        seen.add(lc);
        out.push(k);
      }
    }
    return out;
  }, [jdKeywords, staged]);

  const { inResume, added, willAdd, missing, dirty } = useMemo(() => {
    const inResume: string[] = [];
    const added: string[] = [];
    const willAdd: string[] = [];
    const missing: string[] = [];
    let dirty = false;
    for (const kw of universe) {
      const lc = kw.toLowerCase();
      const isStaged = stagedSet.has(lc);
      const isPresent = presentSet.has(lc);
      const isOriginal = originalSet.has(lc);

      if (isPresent && isOriginal) {
        inResume.push(kw);
      } else if (isPresent && isStaged) {
        added.push(kw);
      } else if (isStaged && !isPresent) {
        willAdd.push(kw);
        dirty = true; // pending add
      } else {
        missing.push(kw);
        if (isPresent && !isOriginal && !isStaged) dirty = true; // pending removal
      }
    }
    return { inResume, added, willAdd, missing, dirty };
  }, [universe, stagedSet, presentSet, originalSet]);

  const matchedNow = useMemo(
    () => jdKeywords.filter((k) => presentSet.has(k.toLowerCase())).length,
    [jdKeywords, presentSet],
  );

  const score = result?.ats_match_score ?? null;
  const total = result?.total_jd_keywords ?? jdKeywords.length;
  const scoreTone =
    score == null
      ? 'bg-off-white border-border text-stone'
      : score >= 80
        ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
        : score >= 60
          ? 'bg-amber/10 border-amber/30 text-amber-hover'
          : 'bg-red-50 border-warning-red/30 text-warning-red';

  const optimizeLabel = generating
    ? hasResume
      ? 'Optimizing...'
      : 'Generating...'
    : hasResume
      ? 'Optimize My Resume'
      : 'Optimize My Resume';

  return (
    <div className="space-y-3">
      {/* Score / status header */}
      <div className={`relative flex items-center justify-between rounded-card border px-3 py-2 ${scoreTone}`}>
        <div className="flex items-center gap-2">
          <Zap className="h-4 w-4 shrink-0" />
          <div>
            {score != null ? (
              <>
                <div className="text-xs font-semibold leading-tight flex items-center gap-1.5">
                  ATS Match Score: {score}%
                  {scoreDelta != null && scoreDelta !== 0 && (
                    <span
                      className={`inline-flex items-center gap-0.5 rounded-badge px-1 text-[10px] font-bold ${
                        scoreDelta > 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-warning-red'
                      }`}
                    >
                      {scoreDelta > 0 ? <TrendingUp className="h-2.5 w-2.5" /> : <TrendingDown className="h-2.5 w-2.5" />}
                      {scoreDelta > 0 ? '+' : ''}{scoreDelta}
                    </span>
                  )}
                </div>
                <div className="text-[10px] opacity-80 leading-tight">
                  {matchedNow} of {total} JD keywords in your resume
                </div>
              </>
            ) : (
              <>
                <div className="text-xs font-semibold leading-tight">
                  {matchedNow} of {total} JD keywords already in your resume
                </div>
                <div className="text-[10px] opacity-80 leading-tight">
                  Add the missing ones below, then optimize to tailor your resume.
                </div>
              </>
            )}
          </div>
        </div>
        {score != null && <div className="text-2xl font-bold tabular-nums">{score}</div>}
      </div>

      {/* Pending-changes banner */}
      {dirty && hasResume && (
        <div className="flex items-center gap-1.5 rounded-btn border border-amber/40 bg-amber/10 px-3 py-2 text-[11px] text-ink">
          <Sparkles className="h-3.5 w-3.5 text-amber shrink-0" />
          You changed your keywords — click <span className="font-semibold">Optimize My Resume</span> to apply.
        </div>
      )}

      {/* IN YOUR RESUME (green, read-only) */}
      {inResume.length > 0 && (
        <div>
          <div className="text-[10px] uppercase tracking-wide text-emerald-700 mb-1.5 font-medium">
            In your resume ({inResume.length})
          </div>
          <div className="flex flex-wrap gap-1.5">
            {inResume.map((kw) => (
              <span
                key={kw}
                className="inline-flex items-center gap-1 rounded-badge border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700"
              >
                <CheckCircle2 className="h-3 w-3" />
                {kw}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* ADDED (green, click to remove) */}
      {added.length > 0 && (
        <div>
          <div className="text-[10px] uppercase tracking-wide text-emerald-700 mb-1.5 font-medium">
            Added ({added.length}) — click to remove
          </div>
          <div className="flex flex-wrap gap-1.5">
            {added.map((kw) => (
              <button
                key={kw}
                type="button"
                onClick={() => onUnstage(kw)}
                disabled={generating}
                title="Woven in. Click to remove on next optimize."
                className="inline-flex items-center gap-1 rounded-badge border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 transition-all duration-150 cursor-pointer hover:border-warning-red/40 hover:bg-red-50 hover:text-warning-red disabled:cursor-wait disabled:opacity-60"
              >
                <CheckCircle2 className="h-3 w-3" />
                {kw}
                <X className="h-2.5 w-2.5 opacity-70" />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* WILL BE ADDED NEXT (amber, pending, click to undo) */}
      {willAdd.length > 0 && (
        <div>
          <div className="text-[10px] uppercase tracking-wide text-amber-hover mb-1.5 font-medium">
            Will be added next ({willAdd.length}) — click to undo
          </div>
          <div className="flex flex-wrap gap-1.5">
            {willAdd.map((kw) => (
              <button
                key={kw}
                type="button"
                onClick={() => onUnstage(kw)}
                disabled={generating}
                title="Pending. Click to undo before optimizing."
                className="inline-flex items-center gap-1 rounded-badge border border-amber/50 bg-amber/15 px-2 py-0.5 text-xs font-semibold text-ink shadow-sm transition-all duration-150 cursor-pointer hover:bg-amber/25 disabled:cursor-wait disabled:opacity-60"
              >
                <Sparkles className="h-2.5 w-2.5 text-amber" />
                {kw}
                <X className="h-2.5 w-2.5 opacity-60" />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* MISSING (red, click to add) */}
      {missing.length > 0 && (
        <div>
          <div className="flex items-center justify-between flex-wrap gap-2 mb-1.5">
            <div className="text-[10px] uppercase tracking-wide text-warning-red font-medium">
              Missing — tap to add ({missing.length})
            </div>
            <button
              type="button"
              onClick={() => onStageMany(missing)}
              disabled={generating}
              className="text-[11px] font-semibold text-amber-hover hover:text-ink underline-offset-2 hover:underline disabled:opacity-50"
            >
              + Add all
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {missing.map((kw) => (
              <button
                key={kw}
                type="button"
                onClick={() => onStage(kw)}
                disabled={generating}
                title="Click to add this keyword on next optimize."
                className="inline-flex items-center gap-1 rounded-badge border border-warning-red/30 bg-red-50 px-2 py-0.5 text-xs text-warning-red transition-all duration-150 cursor-pointer hover:border-amber/40 hover:bg-amber/10 hover:text-ink disabled:cursor-wait disabled:opacity-60"
              >
                <Plus className="h-3 w-3" />
                {kw}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* All-matched celebratory empty state */}
      {missing.length === 0 && willAdd.length === 0 && jdKeywords.length > 0 && (
        <div className="flex items-center gap-1.5 text-xs text-emerald-700">
          <CheckCircle2 className="h-3.5 w-3.5" />
          Every JD keyword is in your resume.
        </div>
      )}

      {/* The one CTA */}
      <button
        onClick={onOptimize}
        disabled={generating}
        className={[
          'w-full justify-center',
          dirty || !hasResume ? 'btn-primary' : 'btn',
        ].join(' ')}
      >
        {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
        {optimizeLabel}
      </button>
    </div>
  );
}
