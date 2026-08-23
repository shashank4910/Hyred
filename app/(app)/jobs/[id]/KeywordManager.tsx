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
 * the chips change colour/bucket. Derived from:
 *   - jdKeywords      : the stable JD keyword universe
 *   - originalPresent : exact phrase hits in the master resume (green)
 *   - closePresent    : close/near wording in the master resume (amber)
 *   - result          : the last generation's added / already_had / missing
 *   - staged          : what the user currently wants woven in (their intent)
 *
 * Buckets:
 *   IN YOUR RESUME      green, read-only     exact + in master resume
 *   ADDED               green, click to undo exact woven, still wanted
 *   WILL BE ADDED NEXT  primary, click undo  staged but not yet exact in resume
 *   CLOSE MATCH         amber, click to add  same skill, different words
 *   MISSING             red,   click to add  no match
 *
 * ATS Match Score stays exact-only (amber does not inflate it).
 */
export function KeywordManager({
  jdKeywords,
  originalPresent,
  closePresent = [],
  inferred = {},
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
  closePresent?: string[];
  /** AI-believed skills: keyword -> evidence sentence (from the fit-check
   *  engine). These render in the amber "likely yours" bucket with a
   *  tooltip explaining WHY the AI believes the user has them. */
  inferred?: Record<string, string>;
  result: GenResult;
  staged: string[];
  generating: boolean;
  hasResume: boolean;
  scoreDelta: number | null;
  onStage: (kw: string) => void;
  onUnstage: (kw: string) => void;
  onStageMany: (kws: string[]) => void;
  onOptimize: (keywordsToWeave?: string[]) => void;
}) {
  const originalSet = useMemo(
    () => new Set(originalPresent.map((k) => k.toLowerCase())),
    [originalPresent],
  );
  const closeSet = useMemo(
    () => new Set(closePresent.map((k) => k.toLowerCase())),
    [closePresent],
  );
  const inferredMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const [k, v] of Object.entries(inferred)) m.set(k.toLowerCase(), v);
    return m;
  }, [inferred]);
  const stagedSet = useMemo(
    () => new Set(staged.map((k) => k.toLowerCase())),
    [staged],
  );
  // Keywords present as EXACT phrases in the CURRENT resume. Before the first
  // optimize there is no result yet, so "present" == master exact hits.
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

  const { inResume, added, willAdd, closeMatch, missing, dirty } = useMemo(() => {
    const inResume: string[] = [];
    const added: string[] = [];
    const willAdd: string[] = [];
    const closeMatch: string[] = [];
    const missing: string[] = [];
    let dirty = false;
    for (const kw of universe) {
      const lc = kw.toLowerCase();
      const isStaged = stagedSet.has(lc);
      const isPresent = presentSet.has(lc);
      const isOriginal = originalSet.has(lc);
      const isClose = closeSet.has(lc) || inferredMap.has(lc);

      if (isPresent && isOriginal) {
        inResume.push(kw);
      } else if (isPresent && isStaged) {
        added.push(kw);
      } else if (isStaged && !isPresent) {
        willAdd.push(kw);
        dirty = true; // pending add
      } else if (isClose && !isPresent) {
        closeMatch.push(kw);
      } else {
        missing.push(kw);
        if (isPresent && !isOriginal && !isStaged) dirty = true; // pending removal
      }
    }
    return { inResume, added, willAdd, closeMatch, missing, dirty };
  }, [universe, stagedSet, presentSet, originalSet, closeSet, inferredMap]);

  const inferredTooltip = (kw: string): string => {
    const lc = kw.toLowerCase();
    if (inferredMap.has(lc)) {
      const why = inferredMap.get(lc);
      return `The AI believes you have used this - it just is not written in your resume. ${why ? `Why: ${why}` : ''} Add it only if you have genuinely worked with it.`;
    }
    return 'You likely have this skill already - the words are just different in your resume. Click to add the JD wording.';
  };

  const exactCount = inResume.length + added.length;
  const score = result?.ats_match_score ?? null;
  const total = result?.total_jd_keywords ?? jdKeywords.length;
  const scoreTone =
    score == null
      ? 'bg-surface-container-low border-outline-variant text-on-surface-variant'
      : score >= 80
        ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
        : score >= 60
          ? 'bg-primary/10 border-primary/30 text-primary'
          : 'bg-error-container/30 border-error/30 text-error';

  const optimizeLabel = generating
    ? hasResume
      ? 'Optimizing...'
      : 'Generating...'
    : 'Optimize My Resume';

  const countsLine = `${exactCount} exact · ${closeMatch.length} close · ${missing.length} missing of ${total}`;

  return (
    <div className="space-y-3">
      <p className="text-[10px] uppercase tracking-wide text-on-surface-variant font-medium mb-0.5">
        What the ATS scanned — exact keywords from this posting, checked against your resume
      </p>
      {/* Score / status header */}
      <div className={`relative flex items-center justify-between rounded-card border px-3 py-2 ${scoreTone}`}>
        <div className="flex items-center gap-2 min-w-0">
          <Zap className="h-4 w-4 shrink-0" />
          <div className="min-w-0">
            {score != null ? (
              <>
                <div className="text-xs font-semibold leading-tight flex items-center gap-1.5 flex-wrap">
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
                <div className="text-[10px] opacity-80 leading-tight">{countsLine}</div>
              </>
            ) : (
              <>
                <div className="text-xs font-semibold leading-tight">{countsLine}</div>
                <div className="text-[10px] opacity-80 leading-tight">
                  Add close or missing keywords below, then optimize to tailor your resume.
                </div>
              </>
            )}
          </div>
        </div>
        {score != null && <div className="text-2xl font-bold tabular-nums shrink-0">{score}</div>}
      </div>

      {/* Color key — short reference for green / amber / red */}
      <div className="rounded-xl border border-outline-variant/40 bg-surface-container-low/60 px-3 py-2 text-[10px] text-on-surface-variant leading-relaxed space-y-0.5">
        <div className="flex items-start gap-1.5">
          <span className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-emerald-500" aria-hidden />
          <span><span className="font-semibold text-emerald-700">Green</span> = direct match - already in your resume. Nothing to do.</span>
        </div>
        <div className="flex items-start gap-1.5">
          <span className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-orange-500" aria-hidden />
          <span><span className="font-semibold text-orange-700">Amber</span> = likely yours - you have probably used this, just never wrote it down. Hover a chip to see why.</span>
        </div>
        <div className="flex items-start gap-1.5">
          <span className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-red-500" aria-hidden />
          <span><span className="font-semibold text-error">Red</span> = not found anywhere. Add only if you have really used it - otherwise skip it.</span>
        </div>
      </div>

      {/* Pending-changes banner */}
      {dirty && hasResume && (
        <div className="flex items-center gap-1.5 rounded-xl border border-primary/40 bg-primary/10 px-3 py-2 text-[11px] text-on-surface">
          <Sparkles className="h-3.5 w-3.5 text-primary shrink-0" />
          You changed your keywords — click <span className="font-semibold">Optimize My Resume</span> to apply.
        </div>
      )}

      {/* IN YOUR RESUME (green, read-only) */}
      {inResume.length > 0 && (
        <div>
          <div className="text-[10px] uppercase tracking-wide text-emerald-700 mb-1.5 font-medium">
            Exact match — in your resume ({inResume.length})
          </div>
          <div className="flex flex-wrap gap-1.5">
            {inResume.map((kw) => (
              <span
                key={kw}
                title="Direct match - this exact keyword is already in your resume. Nothing to do here."
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

      {/* WILL BE ADDED NEXT (primary tint, pending, click to undo) */}
      {willAdd.length > 0 && (
        <div>
          <div className="text-[10px] uppercase tracking-wide text-primary mb-1.5 font-medium">
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
                className="inline-flex items-center gap-1 rounded-badge border border-primary/50 bg-primary/10 px-2 py-0.5 text-xs font-semibold text-on-surface shadow-sm transition-all duration-150 cursor-pointer hover:bg-primary/20 disabled:cursor-wait disabled:opacity-60"
              >
                <Sparkles className="h-2.5 w-2.5 text-primary" />
                {kw}
                <X className="h-2.5 w-2.5 opacity-60" />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* LIKELY YOURS (amber: close wording + AI-believed-from-fit-check) */}
      {closeMatch.length > 0 && (
        <div>
          <div className="flex items-center justify-between flex-wrap gap-2 mb-1.5">
            <div className="text-[10px] uppercase tracking-wide text-orange-700 font-medium">
              Likely yours - tap to add ({closeMatch.length})
            </div>
            <button
              type="button"
              onClick={() => onStageMany(closeMatch)}
              disabled={generating}
              className="text-[11px] font-semibold text-primary hover:text-on-surface underline-offset-2 hover:underline disabled:opacity-50"
            >
              + Add all
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {closeMatch.map((kw) => (
              <button
                key={kw}
                type="button"
                onClick={() => onStage(kw)}
                disabled={generating}
                title={inferredTooltip(kw)}
                className="inline-flex items-center gap-1 rounded-badge border border-orange-300 bg-orange-50 px-2 py-0.5 text-xs text-orange-800 transition-all duration-150 cursor-pointer hover:border-primary/40 hover:bg-primary/10 hover:text-on-surface disabled:cursor-wait disabled:opacity-60"
              >
                <Plus className="h-3 w-3" />
                {kw}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* MISSING (red: add only if genuinely used) */}
      {missing.length > 0 && (
        <div>
          <div className="text-[10px] uppercase tracking-wide text-error font-medium mb-1.5">
            Not in your resume ({missing.length}) - add only if you have really used it
          </div>
          <div className="flex flex-wrap gap-1.5">
            {missing.map((kw) => (
              <button
                key={kw}
                type="button"
                onClick={() => onStage(kw)}
                disabled={generating}
                title="Not found anywhere in your resume. If you have used this - even on a side project - tap to add it and we will weave it into your experience. Not used it? Just skip it; adding skills you cannot discuss in an interview hurts you."
                className="inline-flex items-center gap-1 rounded-badge border border-error/30 bg-error-container/20 px-2 py-0.5 text-xs text-error transition-all duration-150 cursor-pointer hover:border-primary/40 hover:bg-primary/10 hover:text-on-surface disabled:cursor-wait disabled:opacity-60"
              >
                <Plus className="h-3 w-3" />
                {kw}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* All clear — no close, missing, or pending adds */}
      {missing.length === 0 && closeMatch.length === 0 && willAdd.length === 0 && jdKeywords.length > 0 && (
        <div className="flex items-center gap-1.5 text-xs text-emerald-700">
          <CheckCircle2 className="h-3.5 w-3.5" />
          Every JD keyword is covered in your resume.
        </div>
      )}

      {/* The one CTA */}
      <button
        onClick={() => onOptimize()}
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
