'use client';

import { useState, useTransition, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  Sparkles,
  Loader2,
  Copy,
  Download,
  CheckCircle2,
  XCircle,
  ExternalLink,
  Save,
  StickyNote,
  RotateCw,
  Pencil,
  FileText,
  Rocket,
  Zap,
  Bookmark,
} from 'lucide-react';
import { STATUS_ORDER } from '@/lib/ui';
import { KeywordPicker } from './KeywordPicker';

type Skills = { matched: string[]; missing: string[]; allSkills: string[] } | null;


export function JobActions({
  matchId,
  status,
  bookmarked: initialBookmarked,
  coverLetter,
  notes,
  candidateSkills,
  applyUrl,
}: {
  matchId: string;
  status: string;
  bookmarked: boolean;
  coverLetter: string | null;
  notes: string | null;
  candidateSkills: string[];
  applyUrl: string;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  // Bookmark state
  const [bookmarked, setBookmarked] = useState(initialBookmarked);
  const [savingBookmark, setSavingBookmark] = useState(false);

  // Cover letter state
  const [letter, setLetter] = useState(coverLetter ?? '');
  const [editing, setEditing] = useState(false);
  const [generating, setGenerating] = useState(false);

  // Notes state
  const [notesValue, setNotesValue] = useState(notes ?? '');
  const [savingNotes, setSavingNotes] = useState(false);
  const [notesDirty, setNotesDirty] = useState(false);

  // Skills state
  const [skills, setSkills] = useState<Skills>(null);
  const [analyzingSkills, setAnalyzingSkills] = useState(false);

  // ATS Resume state
  const [atsResume, setAtsResume] = useState('');
  const [generatingResume, setGeneratingResume] = useState(false);
  const [resumeCopied, setResumeCopied] = useState(false);
  const [filenameBase, setFilenameBase] = useState<string>('Shashank_Performance_7.7');
  const [keywords, setKeywords] = useState<{
    added: string[];
    already_had: string[];
    missing: string[];
    total_jd_keywords: number;
    selected_count?: number;
    ats_match_score: number;
  } | null>(null);

  // Keyword picker state
  const [jdKeywords, setJdKeywords] = useState<string[]>([]);
  const [alreadyHaveKeywords, setAlreadyHaveKeywords] = useState<string[]>([]);
  const [selectedKeywords, setSelectedKeywords] = useState<string[]>([]);
  const [excludedKeywords, setExcludedKeywords] = useState<string[]>([]);
  const [loadingKeywords, setLoadingKeywords] = useState(false);
  const [keywordsLoaded, setKeywordsLoaded] = useState(false);

  // Free-text input for custom keywords. Lets the user type ANY keyword
  // (including ones that didn't make it into either the matchSkills or the
  // extractJdKeywords output) and stage it for the next regenerate.
  const [customKeyword, setCustomKeyword] = useState('');

  // Missing-keywords list. Source ONLY from the generator's keywords.missing —
  // that set is computed against the ACTUAL generated resume (whole-token match)
  // in generateAtsResume. Previously we merged in skills.missing (from
  // matchSkills, computed against the ORIGINAL resume), which went stale after
  // the first regenerate and caused the same keyword to show as both "Woven in"
  // and "Missing" simultaneously. We additionally drop anything the user has
  // staged for removal (excludedKeywords) so a deliberately-removed keyword never
  // reappears as actionable-missing.
  const allMissingKeywords = useMemo(() => {
    const fromKeywords = keywords?.missing ?? [];
    const seen = new Set<string>();
    const merged: string[] = [];
    for (const kw of fromKeywords) {
      const t = kw.trim();
      if (!t) continue;
      const lower = t.toLowerCase();
      if (seen.has(lower)) continue;
      if (excludedKeywords.some(k => k.toLowerCase() === lower)) continue;
      seen.add(lower);
      merged.push(t);
    }
    return merged;
  }, [keywords?.missing, excludedKeywords]);


  // Load skills if we have any candidate skills
  useEffect(() => {
    if (!candidateSkills.length) return;
    let cancelled = false;
    setAnalyzingSkills(true);
    fetch(`/api/match/${matchId}/skills`, { method: 'POST' })
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        if (d?.matched != null) setSkills(d as Skills);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setAnalyzingSkills(false);
      });
    return () => { cancelled = true; };
  }, [matchId, candidateSkills.length]);

  // Load JD keywords for the keyword picker
  useEffect(() => {
    let cancelled = false;
    setLoadingKeywords(true);
    fetch(`/api/match/${matchId}/resume`)
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        if (d?.keywords) {
          setJdKeywords(d.keywords);
          setAlreadyHaveKeywords(d.alreadyHave ?? []);
          setSelectedKeywords([]);
          setKeywordsLoaded(true);
        }
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoadingKeywords(false); });
    return () => { cancelled = true; };
  }, [matchId]);


  async function generate() {
    setGenerating(true);
    const id = toast.loading('Drafting cover letter...');
    try {
      const res = await fetch(`/api/coverletter`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ match_id: matchId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      setLetter(data.cover_letter);
      toast.success('Cover letter ready', { id });
      startTransition(() => router.refresh());
    } catch (e) {
      toast.error((e as Error).message, { id });
    } finally {
      setGenerating(false);
    }
  }

  async function setStatus(next: string) {
    const id = toast.loading('Updating...');
    try {
      const res = await fetch(`/api/match/${matchId}/status`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: next }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || 'Failed');
      }
      toast.success(`Marked as ${next}`, { id });
      startTransition(() => router.refresh());
    } catch (e) {
      toast.error((e as Error).message, { id });
    }
  }

  async function toggleBookmark() {
    if (savingBookmark) return;
    setSavingBookmark(true);
    const next = !bookmarked;
    setBookmarked(next);
    try {
      const res = await fetch(`/api/match/${matchId}/bookmark`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ bookmarked: next }),
      });
      if (!res.ok) {
        setBookmarked(!next);
        toast.error('Failed to update bookmark');
      } else {
        toast.success(next ? 'Bookmarked!' : 'Bookmark removed');
      }
    } catch {
      setBookmarked(!next);
      toast.error('Failed to update bookmark');
    } finally {
      setSavingBookmark(false);
    }
  }

  async function saveNotes() {
    setSavingNotes(true);
    try {
      const res = await fetch(`/api/match/${matchId}/notes`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ notes: notesValue }),
      });
      if (!res.ok) throw new Error('Failed');
      toast.success('Notes saved');
      setNotesDirty(false);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSavingNotes(false);
    }
  }

  async function copy() {
    await navigator.clipboard.writeText(letter);
    toast.success('Copied to clipboard');
  }

  function download() {
    const blob = new Blob([letter], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'cover-letter.txt';
    a.click();
    URL.revokeObjectURL(url);
  }


  // Resume editing state
  const [editingResume, setEditingResume] = useState(false);
  const [editedResume, setEditedResume] = useState('');

  async function generateAtsResume() {
    setGeneratingResume(true);
    const id = toast.loading('Generating ATS-optimized resume...');
    try {
      const res = await fetch(`/api/match/${matchId}/resume`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          selectedKeywords: selectedKeywords.length > 0 ? selectedKeywords : undefined,
          excludedKeywords: excludedKeywords.length > 0 ? excludedKeywords : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      setAtsResume(data.resume);
      setEditedResume(data.resume);
      setEditingResume(true);
      if (data.keywords) setKeywords(data.keywords);
      if (data.filename_base) setFilenameBase(data.filename_base);
      toast.success('ATS resume ready — review & edit before exporting!', { id });
    } catch (e) {
      toast.error((e as Error).message, { id });
    } finally {
      setGeneratingResume(false);
    }
  }

  // In-place regenerate: keeps the existing resume visible until the new one
  // arrives. Used after the user clicks missing-keyword chips to add them to
  // selectedKeywords, then clicks "Regenerate" without losing context.
  async function regenerateInPlace(extraKeywords?: string[]) {
    setGeneratingResume(true);
    const merged = extraKeywords && extraKeywords.length > 0
      ? [...new Set([...selectedKeywords, ...extraKeywords])]
      : selectedKeywords;
    if (extraKeywords && extraKeywords.length > 0) {
      setSelectedKeywords(merged);
    }
    const id = toast.loading(
      merged.length > 0
        ? `Regenerating with ${merged.length} prioritized keyword${merged.length > 1 ? 's' : ''}...`
        : 'Regenerating ATS resume...',
    );
    try {
      const res = await fetch(`/api/match/${matchId}/resume`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          selectedKeywords: merged.length > 0 ? merged : undefined,
          excludedKeywords: excludedKeywords.length > 0 ? excludedKeywords : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      setAtsResume(data.resume);
      setEditedResume(data.resume);
      if (data.keywords) setKeywords(data.keywords);
      if (data.filename_base) setFilenameBase(data.filename_base);
      const newScore = data.keywords?.ats_match_score ?? 0;
      const oldScore = keywords?.ats_match_score ?? 0;
      const delta = newScore - oldScore;
      const sign = delta > 0 ? '+' : '';
      toast.success(
        `Regenerated. ATS Match Score: ${newScore}%${oldScore > 0 ? ` (${sign}${delta})` : ''}`,
        { id },
      );
    } catch (e) {
      toast.error((e as Error).message, { id });
    } finally {
      setGeneratingResume(false);
    }
  }

  // One-click: stage all currently-missing keywords (merged from both
  // skills.missing and keywords.missing) and regenerate.
  async function addAllMissingAndRegenerate() {
    if (!allMissingKeywords.length) return;
    await regenerateInPlace(allMissingKeywords);
  }

  // User-typed custom keyword: stage it for inclusion (selectedKeywords) and
  // unstage from exclusion if previously excluded. Lets the user force-add
  // any keyword the auto-extractors missed.
  function addCustomKeyword() {
    const t = customKeyword.trim();
    if (!t) return;
    if (selectedKeywords.some(k => k.toLowerCase() === t.toLowerCase())) {
      toast(`"${t}" is already prioritized for next regenerate`);
      setCustomKeyword('');
      return;
    }
    setExcludedKeywords(prev => prev.filter(k => k.toLowerCase() !== t.toLowerCase()));
    setSelectedKeywords(prev => [...prev, t]);
    setCustomKeyword('');
    toast.success(`"${t}" added - will be forced into resume on next regenerate`);
  }

  // User-typed custom keyword: stage it for exclusion. Lets the user force-
  // remove any term that snuck in but they don't want.
  function excludeCustomKeyword() {
    const t = customKeyword.trim();
    if (!t) return;
    if (excludedKeywords.some(k => k.toLowerCase() === t.toLowerCase())) {
      toast(`"${t}" is already staged for removal`);
      setCustomKeyword('');
      return;
    }
    setSelectedKeywords(prev => prev.filter(k => k.toLowerCase() !== t.toLowerCase()));
    setExcludedKeywords(prev => [...prev, t]);
    setCustomKeyword('');
    toast.success(`"${t}" staged for removal on next regenerate`);
  }

  // Clicking a single missing chip stages it for the next regenerate.
  function stageMissingKeyword(kw: string) {
    if (selectedKeywords.some(k => k.toLowerCase() === kw.toLowerCase())) {
      setSelectedKeywords(prev => prev.filter(k => k.toLowerCase() !== kw.toLowerCase()));
      toast(`Removed "${kw}" from priorities`);
    } else {
      // If user previously excluded this keyword, un-exclude it first
      // (intent toggle: now they want it back IN).
      setExcludedKeywords(prev => prev.filter(k => k.toLowerCase() !== kw.toLowerCase()));
      setSelectedKeywords(prev => [...prev, kw]);
      toast.success(`"${kw}" prioritized for next regenerate`);
    }
  }

  // Clicking a present (woven-in / already-had) chip stages it for REMOVAL
  // on the next regenerate. The model will be told it must not appear.
  function toggleExcludeKeyword(kw: string) {
    if (excludedKeywords.some(k => k.toLowerCase() === kw.toLowerCase())) {
      setExcludedKeywords(prev => prev.filter(k => k.toLowerCase() !== kw.toLowerCase()));
      toast(`"${kw}" will stay in resume`);
    } else {
      // If user previously selected this keyword as priority, un-select it
      // first - they're flipping intent from "must include" to "must exclude".
      setSelectedKeywords(prev => prev.filter(k => k.toLowerCase() !== kw.toLowerCase()));
      setExcludedKeywords(prev => [...prev, kw]);
      toast.success(`"${kw}" will be removed on next regenerate`);
    }
  }

  async function copyResume() {
    await navigator.clipboard.writeText(editedResume || atsResume);
    setResumeCopied(true);
    toast.success('Resume copied to clipboard');
    setTimeout(() => setResumeCopied(false), 2000);
  }

  function downloadResumeTxt() {
    const text = editedResume || atsResume;
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${filenameBase}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function downloadResumePdf() {
    const id = toast.loading('Generating beautiful PDF...');
    try {
      const { generateBeautifulPdf } = await import('@/lib/pdf-resume');
      const doc = generateBeautifulPdf(editedResume || atsResume);
      doc.save(`${filenameBase}.pdf`);
      toast.success('PDF downloaded!', { id });
    } catch (e) {
      toast.error(`PDF generation failed: ${(e as Error).message}`, { id });
    }
  }


  return (
    <div className="space-y-3">
      {/* Apply CTA */}
      <div className="card border-amber/30 bg-gradient-to-r from-amber/5 to-transparent">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold text-ink flex items-center gap-2">
              <Rocket className="h-4 w-4 text-amber" /> Ready to apply?
            </h2>
            <p className="text-xs text-stone mt-0.5">
              Opens the original posting. Generate your ATS resume + cover letter first.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* Bookmark toggle */}
            <button
              onClick={toggleBookmark}
              disabled={savingBookmark}
              title={bookmarked ? 'Remove bookmark' : 'Bookmark this job'}
              className={[
                'btn',
                bookmarked ? 'border-amber text-amber bg-amber/10 hover:bg-amber/20' : '',
              ].join(' ')}
            >
              <Bookmark
                className="h-4 w-4"
                fill={bookmarked ? 'currentColor' : 'none'}
              />
              {bookmarked ? 'Bookmarked' : 'Bookmark'}
            </button>
            <a
              href={applyUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => {
                if (status !== 'applied' && status !== 'interviewing' && status !== 'offer') {
                  fetch(`/api/match/${matchId}/status`, {
                    method: 'POST',
                    headers: { 'content-type': 'application/json' },
                    body: JSON.stringify({ status: 'applied' }),
                  })
                    .then(() => startTransition(() => router.refresh()))
                    .catch(() => {});
                }
              }}
              className="btn-primary text-base px-5 py-2.5"
            >
              <ExternalLink className="h-4 w-4" />
              Apply on job site
            </a>
          </div>
        </div>
      </div>

      {/* Status tracker */}
      <div className="card">
        <div className="flex flex-wrap gap-2">
          {STATUS_ORDER.map((s) => (
            <button
              key={s}
              disabled={s === status}
              onClick={() => setStatus(s)}
              className={
                s === status
                  ? 'rounded-btn bg-amber text-ink px-3 py-1.5 text-xs font-semibold'
                  : 'rounded-btn border border-border px-3 py-1.5 text-xs text-stone hover:text-ink hover:border-amber/40 hover:bg-amber/5 transition-colors'
              }
            >
              {s}
            </button>
          ))}
        </div>
      </div>


      {/* Skill match panel */}
      {candidateSkills.length > 0 && (
        <div className="card space-y-3">
          <h2 className="font-semibold text-ink flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-amber" /> Skill match
          </h2>
          {analyzingSkills && !skills && (
            <div className="space-y-2">
              <div className="skeleton h-4 w-2/3" />
              <div className="skeleton h-4 w-1/2" />
            </div>
          )}
          {skills && (
            <>
              {skills.matched.length > 0 ? (
                <div>
                  <div className="text-xs text-stone mb-1.5">
                    JD requirements found in your resume (
                    {skills.matched.length}/
                    {skills.matched.length + skills.missing.length})
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {skills.matched.map((s) => (
                      <span
                        key={s}
                        className="inline-flex items-center gap-1 rounded-badge bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 text-xs"
                      >
                        <CheckCircle2 className="h-3 w-3" />
                        {s}
                      </span>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-xs text-stone">
                  No direct matches found in the JD. Score may rely on adjacent experience.
                </p>
              )}
              {skills.missing.length > 0 && (
                <div>
                  <div className="text-xs text-stone mb-1.5">
                    JD requirements not clearly present in your resume - click to stage for next ATS regenerate
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {skills.missing.map((s) => {
                      const isStaged = selectedKeywords.some(k => k.toLowerCase() === s.toLowerCase());
                      return (
                        <button
                          key={s}
                          type="button"
                          onClick={() => stageMissingKeyword(s)}
                          disabled={generatingResume}
                          title={isStaged ? 'Click to remove from priorities' : 'Click to prioritize for next regenerate'}
                          className={[
                            'inline-flex items-center gap-1 rounded-badge px-2 py-0.5 text-xs transition-all duration-150 cursor-pointer',
                            'disabled:cursor-wait disabled:opacity-60',
                            isStaged
                              ? 'bg-amber/15 text-ink border border-amber/50 font-semibold shadow-sm'
                              : 'border border-warning-red/30 bg-red-50 text-warning-red hover:bg-amber/10 hover:border-amber/40 hover:text-ink',
                          ].join(' ')}
                        >
                          {isStaged ? (
                            <>
                              <CheckCircle2 className="h-3 w-3 text-amber" />
                              {s}
                              <span className="text-[9px] uppercase tracking-wide opacity-70">staged</span>
                            </>
                          ) : (
                            <>
                              <XCircle className="h-3 w-3" />
                              {s}
                            </>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}


      {/* Cover letter */}
      <div className="card">
        <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
          <h2 className="font-semibold text-ink flex items-center gap-2">
            <Pencil className="h-4 w-4 text-amber" /> Cover letter
          </h2>
          <div className="flex gap-2 flex-wrap">
            {letter && (
              <>
                <button onClick={copy} className="btn">
                  <Copy className="h-3.5 w-3.5" /> Copy
                </button>
                <button onClick={download} className="btn">
                  <Download className="h-3.5 w-3.5" /> Download
                </button>
                <button onClick={() => setEditing((v) => !v)} className="btn">
                  {editing ? 'Done' : 'Edit'}
                </button>
              </>
            )}
            <button onClick={generate} disabled={generating} className="btn-primary">
              {generating ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : letter ? (
                <RotateCw className="h-3.5 w-3.5" />
              ) : (
                <Sparkles className="h-3.5 w-3.5" />
              )}
              {generating ? 'Drafting...' : letter ? 'Regenerate' : 'Generate'}
            </button>
          </div>
        </div>
        {generating && !letter && (
          <div className="space-y-2">
            <div className="skeleton h-4 w-full" />
            <div className="skeleton h-4 w-11/12" />
            <div className="skeleton h-4 w-10/12" />
            <div className="skeleton h-4 w-3/4" />
          </div>
        )}
        {letter ? (
          editing ? (
            <textarea
              value={letter}
              onChange={(e) => setLetter(e.target.value)}
              className="input min-h-[260px] font-sans text-sm leading-relaxed"
            />
          ) : (
            <pre className="whitespace-pre-wrap text-sm text-stone font-sans leading-relaxed">
              {letter}
            </pre>
          )
        ) : (
          !generating && (
            <p className="text-sm text-stone">
              Click <span className="text-amber font-medium">Generate</span> to draft a
              tailored cover letter using your resume and this JD.
            </p>
          )
        )}
      </div>


      {/* ATS-Optimized Resume */}
      <div className="card">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <h2 className="font-semibold text-ink flex items-center gap-2">
            <FileText className="h-4 w-4 text-amber" /> ATS Resume
          </h2>
          <div className="flex gap-2 flex-wrap">
            {atsResume && (
              <>
                <button onClick={copyResume} className="btn">
                  <Copy className="h-3.5 w-3.5" /> {resumeCopied ? 'Copied!' : 'Copy'}
                </button>
                <button onClick={downloadResumeTxt} className="btn">
                  <Download className="h-3.5 w-3.5" /> .txt
                </button>
                <button onClick={downloadResumePdf} className="btn-primary">
                  <Download className="h-3.5 w-3.5" /> PDF
                </button>
              </>
            )}
            {!atsResume && (
              <button onClick={generateAtsResume} disabled={generatingResume} className="btn-primary">
                {generatingResume ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Sparkles className="h-3.5 w-3.5" />
                )}
                {generatingResume ? 'Generating...' : 'Generate ATS Resume'}
              </button>
            )}
          </div>
        </div>

        {/* Keyword Picker — shown before generation */}
        {!atsResume && !generatingResume && (
          <div className="space-y-4">
            {loadingKeywords && !keywordsLoaded && (
              <div className="space-y-2">
                <div className="skeleton h-4 w-1/3" />
                <div className="flex gap-2">
                  <div className="skeleton h-7 w-20 rounded-full" />
                  <div className="skeleton h-7 w-24 rounded-full" />
                  <div className="skeleton h-7 w-16 rounded-full" />
                  <div className="skeleton h-7 w-28 rounded-full" />
                  <div className="skeleton h-7 w-20 rounded-full" />
                </div>
              </div>
            )}
            {keywordsLoaded && jdKeywords.length > 0 && (
              <div className="border border-border rounded-card p-3 bg-off-white">
                <KeywordPicker
                  keywords={jdKeywords}
                  alreadyHave={alreadyHaveKeywords}
                  selected={selectedKeywords}
                  onSelectionChange={setSelectedKeywords}
                />
              </div>
            )}
            {keywordsLoaded && jdKeywords.length === 0 && (
              <p className="text-sm text-stone">
                Click <span className="text-amber font-medium">Generate ATS Resume</span> to create a version optimized for this job&apos;s ATS keywords.
              </p>
            )}
          </div>
        )}


        {/* Loading skeleton */}
        {generatingResume && !atsResume && (
          <div className="space-y-2 mt-3">
            <div className="skeleton h-4 w-full" />
            <div className="skeleton h-4 w-11/12" />
            <div className="skeleton h-4 w-10/12" />
            <div className="skeleton h-4 w-9/12" />
            <div className="skeleton h-4 w-3/4" />
          </div>
        )}

        {/* Generated resume — editable preview */}
        {atsResume && (
          <div className="space-y-3">
            {/* Keyword analysis */}
            {keywords && (
              <div className="space-y-2 border-b border-border pb-3">
                {/* ATS Match Score — the headline number */}
                {(() => {
                  const score = keywords.ats_match_score ?? 0;
                  const tone =
                    score >= 80 ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                    : score >= 60 ? 'bg-amber/10 border-amber/30 text-amber-hover'
                    : 'bg-red-50 border-warning-red/30 text-warning-red';
                  const label =
                    score >= 80 ? 'Strong'
                    : score >= 60 ? 'Decent'
                    : 'Weak';
                  return (
                    <div className={`relative flex items-center justify-between rounded-card border px-3 py-2 ${tone}`}>
                      <div className="flex items-center gap-2">
                        <Zap className="h-4 w-4" />
                        <div>
                          <div className="text-xs font-semibold leading-tight">
                            ATS Match Score: {score}% ({label})
                          </div>
                          <div className="text-[10px] opacity-80 leading-tight">
                            {keywords.added.length + keywords.already_had.length} of {keywords.total_jd_keywords} JD keywords present in your resume
                          </div>
                        </div>
                      </div>
                      <div className="text-2xl font-bold tabular-nums">{score}</div>
                      {generatingResume && (
                        <div className="absolute inset-0 flex items-center justify-center rounded-card bg-white/70 backdrop-blur-sm">
                          <div className="flex items-center gap-2 text-xs font-medium text-ink">
                            <Loader2 className="h-4 w-4 animate-spin text-amber" />
                            Regenerating with prioritized keywords...
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()}

                <div className="text-xs font-medium text-stone flex items-center gap-1.5">
                  <Zap className="h-3.5 w-3.5 text-amber" />
                  Keywords analysis ({keywords.total_jd_keywords} detected in JD
                  {keywords.selected_count ? `, ${keywords.selected_count} prioritized` : ''})
                </div>
                {keywords.added.length > 0 && (
                  <div>
                    <div className="text-[10px] uppercase tracking-wide text-amber-hover mb-1 font-medium">
                      + Woven into your resume ({keywords.added.length}) - click to remove
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {keywords.added.map((kw) => {
                        const isExcluded = excludedKeywords.some(k => k.toLowerCase() === kw.toLowerCase());
                        return (
                          <button
                            key={kw}
                            type="button"
                            onClick={() => toggleExcludeKeyword(kw)}
                            disabled={generatingResume}
                            title={isExcluded ? 'Click to keep in resume' : 'Click to remove on next regenerate'}
                            className={[
                              'inline-flex items-center gap-1 rounded-badge px-2 py-0.5 text-xs font-medium transition-all duration-150 cursor-pointer',
                              'disabled:cursor-wait disabled:opacity-60',
                              isExcluded
                                ? 'border border-warning-red/50 bg-red-50 text-warning-red line-through'
                                : 'bg-amber/10 text-amber-hover hover:bg-red-50 hover:text-warning-red hover:border hover:border-warning-red/30',
                            ].join(' ')}
                          >
                            {isExcluded ? (
                              <>
                                <XCircle className="h-2.5 w-2.5" />
                                {kw}
                                <span className="text-[9px] uppercase tracking-wide opacity-70 no-underline">remove</span>
                              </>
                            ) : (
                              <>+ {kw}</>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
                {keywords.already_had.length > 0 && (
                  <div>
                    <div className="text-[10px] uppercase tracking-wide text-stone mb-1">
                      Already in your resume ({keywords.already_had.length}) - click to remove
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {keywords.already_had.map((kw) => {
                        const isExcluded = excludedKeywords.some(k => k.toLowerCase() === kw.toLowerCase());
                        return (
                          <button
                            key={kw}
                            type="button"
                            onClick={() => toggleExcludeKeyword(kw)}
                            disabled={generatingResume}
                            title={isExcluded ? 'Click to keep in resume' : 'Click to remove on next regenerate'}
                            className={[
                              'inline-flex items-center gap-1 rounded-badge px-2 py-0.5 text-xs transition-all duration-150 cursor-pointer',
                              'disabled:cursor-wait disabled:opacity-60',
                              isExcluded
                                ? 'border border-warning-red/50 bg-red-50 text-warning-red line-through'
                                : 'border border-border text-stone hover:bg-red-50 hover:text-warning-red hover:border-warning-red/30',
                            ].join(' ')}
                          >
                            {isExcluded ? (
                              <>
                                <XCircle className="h-2.5 w-2.5" />
                                {kw}
                                <span className="text-[9px] uppercase tracking-wide opacity-70 no-underline">remove</span>
                              </>
                            ) : (
                              <>
                                <CheckCircle2 className="h-2.5 w-2.5" /> {kw}
                              </>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
                {allMissingKeywords.length > 0 && (
                  <div>
                    <div className="flex items-center justify-between flex-wrap gap-2 mb-1.5">
                      <div className="text-[10px] uppercase tracking-wide text-warning-red font-medium">
                        Missing from your resume ({allMissingKeywords.length}) - click to add
                      </div>
                      <button
                        onClick={addAllMissingAndRegenerate}
                        disabled={generatingResume}
                        className="text-[11px] font-semibold text-amber-hover hover:text-ink underline-offset-2 hover:underline disabled:opacity-50"
                      >
                        {generatingResume ? 'Regenerating...' : '+ Add all & regenerate'}
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {allMissingKeywords.map((kw) => {
                        const isStaged = selectedKeywords.some(k => k.toLowerCase() === kw.toLowerCase());
                        return (
                          <button
                            key={kw}
                            type="button"
                            onClick={() => stageMissingKeyword(kw)}
                            disabled={generatingResume}
                            title={isStaged ? 'Click to remove from priorities' : 'Click to prioritize for next regenerate'}
                            className={[
                              'inline-flex items-center gap-1 rounded-badge px-2 py-0.5 text-xs transition-all duration-150 cursor-pointer',
                              'disabled:cursor-wait disabled:opacity-60',
                              isStaged
                                ? 'bg-amber/15 text-ink border border-amber/50 font-semibold shadow-sm'
                                : 'border border-warning-red/30 bg-red-50 text-warning-red hover:bg-amber/10 hover:border-amber/40 hover:text-ink',
                            ].join(' ')}
                          >
                            {isStaged ? (
                              <>
                                <CheckCircle2 className="h-2.5 w-2.5 text-amber" />
                                {kw}
                                <span className="text-[9px] uppercase tracking-wide opacity-70">staged</span>
                              </>
                            ) : (
                              <>
                                <XCircle className="h-2.5 w-2.5" />
                                {kw}
                              </>
                            )}
                          </button>
                        );
                      })}
                    </div>
                    {(selectedKeywords.length > 0 || excludedKeywords.length > 0) && (
                      <div className="mt-2 flex items-center justify-between gap-2 rounded-btn bg-amber/10 border border-amber/30 px-3 py-2">
                        <div className="text-[11px] text-ink">
                          {selectedKeywords.length > 0 && (
                            <>
                              <span className="font-semibold text-amber-hover">+{selectedKeywords.length}</span>{' '}
                              to add
                            </>
                          )}
                          {selectedKeywords.length > 0 && excludedKeywords.length > 0 && <span className="mx-1.5 text-stone">·</span>}
                          {excludedKeywords.length > 0 && (
                            <>
                              <span className="font-semibold text-warning-red">-{excludedKeywords.length}</span>{' '}
                              to remove
                            </>
                          )}
                          {' '}staged for next regenerate.
                        </div>
                        <button
                          onClick={() => regenerateInPlace()}
                          disabled={generatingResume}
                          className="btn-primary text-xs whitespace-nowrap"
                        >
                          {generatingResume ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <RotateCw className="h-3 w-3" />
                          )}
                          Regenerate
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* Custom-keyword free-text input.
                    Always rendered after generation so the user can force-add
                    or force-remove ANY keyword - including ones that the auto-
                    extractors (matchSkills + extractJdKeywords) missed. */}
                <div className="mt-3 rounded-card border border-border bg-off-white p-3">
                  <div className="text-[10px] uppercase tracking-wide text-stone mb-1.5 font-medium">
                    Custom keyword - type any keyword the auto-detection missed
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      type="text"
                      value={customKeyword}
                      onChange={(e) => setCustomKeyword(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          addCustomKeyword();
                        }
                      }}
                      disabled={generatingResume}
                      placeholder="e.g. non-functional requirements, NFR, AppDynamics..."
                      className="input flex-1 min-w-[180px] py-1.5 text-xs"
                    />
                    <button
                      type="button"
                      onClick={addCustomKeyword}
                      disabled={generatingResume || !customKeyword.trim()}
                      className="btn-primary text-xs disabled:opacity-50"
                      title="Force-include this keyword on next regenerate"
                    >
                      + Add
                    </button>
                    <button
                      type="button"
                      onClick={excludeCustomKeyword}
                      disabled={generatingResume || !customKeyword.trim()}
                      className="btn text-xs border-warning-red/30 text-warning-red hover:bg-red-50 disabled:opacity-50"
                      title="Force-remove this keyword on next regenerate"
                    >
                      <XCircle className="h-3 w-3" /> Remove
                    </button>
                  </div>
                  <div className="text-[10px] text-stone mt-1.5">
                    Type a keyword and press Enter or click Add. Use Remove to force the model to drop a keyword that's currently in the resume.
                  </div>
                </div>
              </div>
            )}


            {/* Action bar: Edit / Preview toggle */}
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setEditingResume(true)}
                  className={editingResume
                    ? 'text-xs font-medium text-amber border-b border-amber pb-0.5'
                    : 'text-xs text-stone hover:text-ink'
                  }
                >
                  <Pencil className="h-3 w-3 inline mr-1" />
                  Edit
                </button>
                <button
                  onClick={() => {
                    setEditingResume(false);
                    setAtsResume(editedResume);
                  }}
                  className={!editingResume
                    ? 'text-xs font-medium text-amber border-b border-amber pb-0.5'
                    : 'text-xs text-stone hover:text-ink'
                  }
                >
                  <FileText className="h-3 w-3 inline mr-1" />
                  Preview
                </button>
              </div>
              <button
                onClick={() => regenerateInPlace()}
                disabled={generatingResume}
                className="btn text-xs"
              >
                {generatingResume ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <RotateCw className="h-3 w-3" />
                )}
                {generatingResume ? 'Regenerating...' : 'Regenerate'}
              </button>
            </div>

            {/* Editable textarea or read-only preview */}
            {editingResume ? (
              <div className="space-y-2">
                <textarea
                  value={editedResume}
                  onChange={(e) => setEditedResume(e.target.value)}
                  className="input min-h-[420px] font-mono text-sm leading-relaxed resize-y"
                  placeholder="Edit your resume here..."
                />
                <div className="flex items-center justify-between">
                  <p className="text-[11px] text-stone">
                    Edit anything above — your changes will be used when exporting PDF or copying.
                  </p>
                  <button
                    onClick={() => {
                      setAtsResume(editedResume);
                      setEditingResume(false);
                      toast.success('Changes saved');
                    }}
                    className="btn-primary text-xs"
                  >
                    <Save className="h-3 w-3" />
                    Save & Preview
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <pre className="whitespace-pre-wrap text-sm text-stone font-sans leading-relaxed bg-off-white border border-border rounded-card p-3 max-h-[420px] overflow-y-auto">
                  {editedResume || atsResume}
                </pre>
                <div className="flex items-center gap-1.5 text-xs text-stone">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                  Tailored for this job. Click Edit to make changes, then export as PDF.
                </div>
              </div>
            )}
          </div>
        )}
      </div>


      {/* Notes */}
      <div className="card">
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-semibold text-ink flex items-center gap-2">
            <StickyNote className="h-4 w-4 text-amber" /> Notes
          </h2>
          {notesDirty && (
            <button onClick={saveNotes} disabled={savingNotes} className="btn-primary">
              {savingNotes ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Save className="h-3.5 w-3.5" />
              )}
              Save
            </button>
          )}
        </div>
        <textarea
          className="input min-h-[120px]"
          value={notesValue}
          onChange={(e) => {
            setNotesValue(e.target.value);
            setNotesDirty(true);
          }}
          placeholder="Recruiter contact, interview prep, follow-up dates..."
        />
      </div>
    </div>
  );
}
