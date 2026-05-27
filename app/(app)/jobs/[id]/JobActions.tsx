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
  XCircle,
  ExternalLink,
  Save,
  StickyNote,
  RotateCw,
  Pencil,
  FileText,
  Rocket,
  Zap,
} from 'lucide-react';
import { STATUS_ORDER } from '@/lib/ui';
import { KeywordPicker } from './KeywordPicker';

type Skills = { matched: string[]; missing: string[]; allSkills: string[] } | null;

export function JobActions({
  matchId,
  status,
  coverLetter,
  notes,
  candidateSkills,
  applyUrl,
}: {
  matchId: string;
  status: string;
  coverLetter: string | null;
  notes: string | null;
  candidateSkills: string[];
  applyUrl: string;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();

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
  const [keywords, setKeywords] = useState<{
    added: string[];
    already_had: string[];
    total_jd_keywords: number;
    selected_count?: number;
  } | null>(null);

  // Keyword picker state
  const [jdKeywords, setJdKeywords] = useState<string[]>([]);
  const [alreadyHaveKeywords, setAlreadyHaveKeywords] = useState<string[]>([]);
  const [selectedKeywords, setSelectedKeywords] = useState<string[]>([]);
  const [loadingKeywords, setLoadingKeywords] = useState(false);
  const [keywordsLoaded, setKeywordsLoaded] = useState(false);

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
    return () => {
      cancelled = true;
    };
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
          // Start with nothing selected — user must explicitly pick
          setSelectedKeywords([]);
          setKeywordsLoaded(true);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoadingKeywords(false);
      });
    return () => {
      cancelled = true;
    };
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
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      setAtsResume(data.resume);
      setEditedResume(data.resume);
      setEditingResume(true); // Open in edit/preview mode by default
      if (data.keywords) setKeywords(data.keywords);
      toast.success('ATS resume ready — review & edit before exporting!', { id });
    } catch (e) {
      toast.error((e as Error).message, { id });
    } finally {
      setGeneratingResume(false);
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
    a.download = 'resume-ats-optimized.txt';
    a.click();
    URL.revokeObjectURL(url);
  }

  async function downloadResumePdf() {
    const id = toast.loading('Generating beautiful PDF...');
    try {
      const { generateBeautifulPdf } = await import('@/lib/pdf-resume');
      const doc = generateBeautifulPdf(editedResume || atsResume);
      doc.save('resume-ats-optimized.pdf');
      toast.success('PDF downloaded!', { id });
    } catch (e) {
      toast.error(`PDF generation failed: ${(e as Error).message}`, { id });
    }
  }

  return (
    <div className="space-y-3">
      {/* Apply CTA — big, prominent, impossible to miss */}
      <div className="card border-primary/30 bg-gradient-to-r from-primary/5 to-transparent">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold flex items-center gap-2">
              <Rocket className="h-4 w-4 text-primary" /> Ready to apply?
            </h2>
            <p className="text-xs text-muted mt-0.5">
              Opens the original posting. Generate your ATS resume + cover letter first.
            </p>
          </div>
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
            className="btn-primary text-base px-5 py-2.5 shadow-lg shadow-primary/20"
          >
            <ExternalLink className="h-4 w-4" />
            Apply on job site
          </a>
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
                  ? 'rounded-full bg-primary text-bg px-3 py-1 text-xs font-semibold'
                  : 'rounded-full border border-border px-3 py-1 text-xs text-muted hover:text-primary hover:border-primary/40'
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
          <h2 className="font-semibold flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" /> Skill match
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
                  <div className="text-xs text-muted mb-1.5">
                    JD requirements found in your resume (
                    {skills.matched.length}/
                    {skills.matched.length + skills.missing.length})
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {skills.matched.map((s) => (
                      <span
                        key={s}
                        className="inline-flex items-center gap-1 rounded-full bg-primary/15 text-primary px-2 py-0.5 text-xs"
                      >
                        <CheckCircle2 className="h-3 w-3" />
                        {s}
                      </span>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-xs text-muted">
                  No direct matches found in the JD. Score may rely on adjacent
                  experience.
                </p>
              )}

              {skills.missing.length > 0 && (
                <div>
                  <div className="text-xs text-muted mb-1.5">
                    JD requirements not clearly present in your resume
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {skills.missing.map((s) => (
                      <span
                        key={s}
                        className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 text-amber-300 px-2 py-0.5 text-xs"
                      >
                        <XCircle className="h-3 w-3" />
                        {s}
                      </span>
                    ))}
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
          <h2 className="font-semibold flex items-center gap-2">
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
                <button
                  onClick={() => setEditing((v) => !v)}
                  className="btn"
                >
                  {editing ? 'Done' : 'Edit'}
                </button>
              </>
            )}
            <button
              onClick={generate}
              disabled={generating}
              className="btn-primary"
            >
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
            <pre className="whitespace-pre-wrap text-sm text-fg/90 font-sans leading-relaxed">
              {letter}
            </pre>
          )
        ) : (
          !generating && (
            <p className="text-sm text-muted">
              Click <span className="text-primary">Generate</span> to draft a
              tailored cover letter using your resume and this JD.
            </p>
          )
        )}
      </div>

      {/* ATS-Optimized Resume */}
      <div className="card">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <h2 className="font-semibold flex items-center gap-2">
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
            {!atsResume && (
              <button
                onClick={generateAtsResume}
                disabled={generatingResume}
                className="btn-primary"
              >
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

        {/* Keyword Picker — shown before generation or for regeneration */}
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
              <div className="border border-border rounded-lg p-3 bg-bg/40">
                <KeywordPicker
                  keywords={jdKeywords}
                  alreadyHave={alreadyHaveKeywords}
                  selected={selectedKeywords}
                  onSelectionChange={setSelectedKeywords}
                />
              </div>
            )}

            {keywordsLoaded && jdKeywords.length === 0 && (
              <p className="text-sm text-muted">
                Click <span className="text-primary">Generate ATS Resume</span> to create a version of your resume optimized for this job&apos;s ATS keywords. Never fabricates experience — only reorders and emphasizes what you already have.
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
                <div className="text-xs font-medium text-muted flex items-center gap-1.5">
                  <Zap className="h-3.5 w-3.5 text-primary" />
                  Keywords analysis ({keywords.total_jd_keywords} detected in JD
                  {keywords.selected_count ? `, ${keywords.selected_count} prioritized` : ''})
                </div>
                {keywords.added.length > 0 && (
                  <div>
                    <div className="text-[10px] uppercase tracking-wide text-primary mb-1">
                      + Woven into your resume ({keywords.added.length})
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {keywords.added.map((kw) => (
                        <span
                          key={kw}
                          className="inline-flex items-center gap-0.5 rounded-full bg-primary/15 text-primary px-2 py-0.5 text-xs font-medium"
                        >
                          + {kw}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {keywords.already_had.length > 0 && (
                  <div>
                    <div className="text-[10px] uppercase tracking-wide text-muted mb-1">
                      Already in your resume ({keywords.already_had.length})
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {keywords.already_had.map((kw) => (
                        <span
                          key={kw}
                          className="inline-flex items-center gap-0.5 rounded-full border border-border px-2 py-0.5 text-xs text-muted"
                        >
                          <CheckCircle2 className="h-2.5 w-2.5" /> {kw}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Action bar: Edit / Preview toggle + Export buttons */}
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setEditingResume(true)}
                  className={editingResume
                    ? 'text-xs font-medium text-primary border-b border-primary pb-0.5'
                    : 'text-xs text-muted hover:text-fg'
                  }
                >
                  <Pencil className="h-3 w-3 inline mr-1" />
                  Edit
                </button>
                <button
                  onClick={() => {
                    setEditingResume(false);
                    setAtsResume(editedResume); // save edits
                  }}
                  className={!editingResume
                    ? 'text-xs font-medium text-primary border-b border-primary pb-0.5'
                    : 'text-xs text-muted hover:text-fg'
                  }
                >
                  <FileText className="h-3 w-3 inline mr-1" />
                  Preview
                </button>
              </div>
              <button
                onClick={() => {
                  setAtsResume('');
                  setEditedResume('');
                  setKeywords(null);
                  setEditingResume(false);
                }}
                className="btn text-xs"
              >
                <RotateCw className="h-3 w-3" />
                Regenerate
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
                  <p className="text-[11px] text-muted">
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
                <pre className="whitespace-pre-wrap text-sm text-fg/90 font-sans leading-relaxed bg-bg/50 border border-border rounded-lg p-3 max-h-[420px] overflow-y-auto">
                  {editedResume || atsResume}
                </pre>
                <div className="flex items-center gap-1.5 text-xs text-muted">
                  <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
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
          <h2 className="font-semibold flex items-center gap-2">
            <StickyNote className="h-4 w-4 text-primary" /> Notes
          </h2>
          {notesDirty && (
            <button
              onClick={saveNotes}
              disabled={savingNotes}
              className="btn-primary"
            >
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
