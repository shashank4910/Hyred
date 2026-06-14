'use client';

import { useState, useTransition, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  Sparkles,
  Loader2,
  Copy,
  Download,
  CheckCircle2,
  ExternalLink,
  Save,
  StickyNote,
  RotateCw,
  Pencil,
  FileText,
  Rocket,
  Bookmark,
} from 'lucide-react';
import { STATUS_ORDER } from '@/lib/ui';
import { KeywordManager, type GenResult } from './KeywordManager';


export function JobActions({
  matchId,
  status,
  bookmarked: initialBookmarked,
  coverLetter,
  notes,
  applyUrl,
}: {
  matchId: string;
  status: string;
  bookmarked: boolean;
  coverLetter: string | null;
  notes: string | null;
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

  // ATS Resume state
  const [atsResume, setAtsResume] = useState('');
  const [generatingResume, setGeneratingResume] = useState(false);
  const [resumeCopied, setResumeCopied] = useState(false);
  const [filenameBase, setFilenameBase] = useState<string>('Shashank_Performance_7.7');
  const [keywords, setKeywords] = useState<GenResult>(null);
  // Change in ATS score vs the previous optimize (for the +N / -N badge).
  const [scoreDelta, setScoreDelta] = useState<number | null>(null);

  // Keyword state. jdKeywords = the stable JD keyword universe (from GET).
  // alreadyHaveKeywords = the subset present in the master resume.
  // selectedKeywords = the user's current "weave these in" intent (staged).
  const [jdKeywords, setJdKeywords] = useState<string[]>([]);
  const [alreadyHaveKeywords, setAlreadyHaveKeywords] = useState<string[]>([]);
  const [selectedKeywords, setSelectedKeywords] = useState<string[]>([]);
  // LLM-decided keyword types (tool vs activity), keyed by keyword. Ferried back
  // to the POST so placement is driven by the model's judgement, not a heuristic.
  const [keywordTypes, setKeywordTypes] = useState<Record<string, string>>({});
  const [loadingKeywords, setLoadingKeywords] = useState(false);
  const [keywordsLoaded, setKeywordsLoaded] = useState(false);

  // Load JD keywords for the keyword panel
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
          setKeywordTypes(d.keywordTypes ?? {});
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

  // The single action. Generates (or regenerates in-place) the resume, weaving
  // in exactly the staged keywords. Keeps the current resume visible while it
  // runs, and reports the score change.
  async function optimize() {
    setGeneratingResume(true);
    const firstRun = !atsResume;
    const id = toast.loading(firstRun ? 'Optimizing your resume...' : 'Re-optimizing...');
    const oldScore = keywords?.ats_match_score ?? null;
    try {
      const res = await fetch(`/api/match/${matchId}/resume`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          selectedKeywords: selectedKeywords.length > 0 ? selectedKeywords : undefined,
          jdKeywords: jdKeywords.length > 0 ? jdKeywords : undefined,
          keywordTypes: Object.keys(keywordTypes).length > 0 ? keywordTypes : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      setAtsResume(data.resume);
      setEditedResume(data.resume);
      if (firstRun) setEditingResume(false);
      if (data.keywords) {
        const newScore = data.keywords.ats_match_score ?? 0;
        setScoreDelta(oldScore != null ? newScore - oldScore : null);
        setKeywords(data.keywords);
      }
      if (data.filename_base) setFilenameBase(data.filename_base);
      const newScore = data.keywords?.ats_match_score ?? 0;
      toast.success(`ATS Match Score: ${newScore}%`, { id });
    } catch (e) {
      toast.error((e as Error).message, { id });
    } finally {
      setGeneratingResume(false);
    }
  }

  // Stage a keyword to be woven in on the next optimize (case-insensitive).
  function onStage(kw: string) {
    setSelectedKeywords(prev =>
      prev.some(k => k.toLowerCase() === kw.toLowerCase()) ? prev : [...prev, kw],
    );
  }

  // Un-stage a keyword. Because every optimize regenerates from the MASTER
  // resume, dropping a keyword from the staged set is all that's needed to
  // remove it on the next optimize — no separate "exclude" list required.
  function onUnstage(kw: string) {
    setSelectedKeywords(prev => prev.filter(k => k.toLowerCase() !== kw.toLowerCase()));
  }

  // Stage every keyword in a list (used by "Add all" on the Missing bucket).
  function onStageMany(kws: string[]) {
    setSelectedKeywords(prev => {
      const have = new Set(prev.map(k => k.toLowerCase()));
      const next = [...prev];
      for (const kw of kws) {
        if (!have.has(kw.toLowerCase())) {
          have.add(kw.toLowerCase());
          next.push(kw);
        }
      }
      return next;
    });
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
      const text = editedResume || atsResume;
      const doc = generateBeautifulPdf(text);
      const filename = `${filenameBase}.pdf`;

      // iOS Safari (iPhone/iPad) often ignores jsPDF doc.save(); blob + anchor
      // opens the system PDF preview reliably with the same bytes as desktop.
      const blob = doc.output('blob');
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);

      toast.success('PDF downloaded!', { id });
    } catch (e) {
      toast.error(`PDF generation failed: ${(e as Error).message}`, { id });
    }
  }


  return (
    <div className="space-y-3">
      {/* Apply CTA */}
      <div className="card border-primary/20 bg-gradient-to-r from-primary/5 to-transparent">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold text-on-surface flex items-center gap-2">
              <Rocket className="h-4 w-4 text-primary" /> Ready to apply?
            </h2>
            <p className="text-xs text-on-surface-variant mt-0.5">
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
                bookmarked ? 'border-primary text-primary bg-primary/10 hover:bg-primary/20' : '',
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
                  ? 'rounded-xl bg-primary-container text-on-primary-container px-3 py-1.5 text-xs font-semibold'
                  : 'rounded-xl border border-outline-variant px-3 py-1.5 text-xs text-on-surface-variant hover:text-on-surface hover:border-primary/40 hover:bg-primary/5 transition-colors'
              }
            >
              {s}
            </button>
          ))}
        </div>
      </div>


      {/* Cover letter */}
      <div className="card">
        <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
          <h2 className="font-semibold text-on-surface flex items-center gap-2">
            <Pencil className="h-4 w-4 text-primary" /> Cover letter
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
            <pre className="whitespace-pre-wrap text-sm text-on-surface-variant font-sans leading-relaxed">
              {letter}
            </pre>
          )
        ) : (
          !generating && (
            <p className="text-sm text-on-surface-variant">
              Click <span className="text-primary font-medium">Generate</span> to draft a
              tailored cover letter using your resume and this JD.
            </p>
          )
        )}
      </div>


      {/* ATS-Optimized Resume */}
      <div id="ats-resume" className="card">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <h2 className="font-semibold text-on-surface flex items-center gap-2">
            <FileText className="h-4 w-4 text-primary" /> ATS Resume
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
          </div>
        </div>

        {/* Keyword manager — the single keyword surface, shown before AND after
            generation. The Optimize button inside it is the one CTA. */}
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
        {keywordsLoaded && (
          <KeywordManager
            jdKeywords={jdKeywords}
            originalPresent={alreadyHaveKeywords}
            result={keywords}
            staged={selectedKeywords}
            generating={generatingResume}
            hasResume={!!atsResume}
            scoreDelta={scoreDelta}
            onStage={onStage}
            onUnstage={onUnstage}
            onStageMany={onStageMany}
            onOptimize={optimize}
          />
        )}

        {/* First-run loading skeleton for the resume body */}
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
          <div className="space-y-3 border-t border-outline-variant pt-3 mt-3">
            {/* Action bar: Edit / Preview toggle */}
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setEditingResume(true)}
                  className={editingResume
                    ? 'text-xs font-medium text-primary border-b border-primary pb-0.5'
                    : 'text-xs text-on-surface-variant hover:text-on-surface'
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
                    ? 'text-xs font-medium text-primary border-b border-primary pb-0.5'
                    : 'text-xs text-on-surface-variant hover:text-on-surface'
                  }
                >
                  <FileText className="h-3 w-3 inline mr-1" />
                  Preview
                </button>
              </div>
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
                  <p className="text-[11px] text-on-surface-variant">
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
                <pre className="whitespace-pre-wrap text-sm text-on-surface-variant font-sans leading-relaxed bg-surface-container-low border border-outline-variant rounded-2xl p-4 max-h-[420px] overflow-y-auto">
                  {editedResume || atsResume}
                </pre>
                <div className="flex items-center gap-1.5 text-xs text-on-surface-variant">
                  <CheckCircle2 className="h-3.5 w-3.5 text-match-success" />
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
          <h2 className="font-semibold text-on-surface flex items-center gap-2">
            <StickyNote className="h-4 w-4 text-primary" /> Notes
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
