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
} from 'lucide-react';
import { STATUS_ORDER } from '@/lib/ui';

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

  async function generateAtsResume() {
    setGeneratingResume(true);
    const id = toast.loading('Generating ATS-optimized resume...');
    try {
      const res = await fetch(`/api/match/${matchId}/resume`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      setAtsResume(data.resume);
      toast.success('ATS resume ready!', { id });
    } catch (e) {
      toast.error((e as Error).message, { id });
    } finally {
      setGeneratingResume(false);
    }
  }

  async function copyResume() {
    await navigator.clipboard.writeText(atsResume);
    setResumeCopied(true);
    toast.success('Resume copied to clipboard');
    setTimeout(() => setResumeCopied(false), 2000);
  }

  function downloadResume() {
    const blob = new Blob([atsResume], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'resume-ats-optimized.txt';
    a.click();
    URL.revokeObjectURL(url);
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
                    Your skills mentioned in this JD ({skills.matched.length}/
                    {skills.allSkills.length})
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
                    Skills the JD asks for that you may not have listed
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
        <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
          <h2 className="font-semibold flex items-center gap-2">
            <FileText className="h-4 w-4 text-primary" /> ATS Resume
          </h2>
          <div className="flex gap-2 flex-wrap">
            {atsResume && (
              <>
                <button onClick={copyResume} className="btn">
                  <Copy className="h-3.5 w-3.5" /> {resumeCopied ? 'Copied!' : 'Copy'}
                </button>
                <button onClick={downloadResume} className="btn">
                  <Download className="h-3.5 w-3.5" /> Download .txt
                </button>
              </>
            )}
            <button
              onClick={generateAtsResume}
              disabled={generatingResume}
              className="btn-primary"
            >
              {generatingResume ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : atsResume ? (
                <RotateCw className="h-3.5 w-3.5" />
              ) : (
                <Sparkles className="h-3.5 w-3.5" />
              )}
              {generatingResume
                ? 'Generating...'
                : atsResume
                  ? 'Regenerate'
                  : 'Generate ATS Resume'}
            </button>
          </div>
        </div>
        {generatingResume && !atsResume && (
          <div className="space-y-2">
            <div className="skeleton h-4 w-full" />
            <div className="skeleton h-4 w-11/12" />
            <div className="skeleton h-4 w-10/12" />
            <div className="skeleton h-4 w-9/12" />
            <div className="skeleton h-4 w-3/4" />
          </div>
        )}
        {atsResume ? (
          <div>
            <div className="text-xs text-muted mb-2 flex items-center gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
              Tailored for this job. Keywords injected. ATS-parseable plain text.
            </div>
            <pre className="whitespace-pre-wrap text-sm text-fg/90 font-sans leading-relaxed bg-bg/50 border border-border rounded-lg p-3 max-h-[400px] overflow-y-auto">
              {atsResume}
            </pre>
          </div>
        ) : (
          !generatingResume && (
            <p className="text-sm text-muted">
              Click <span className="text-primary">Generate ATS Resume</span> to create a version of your resume optimized for this job&apos;s ATS keywords. Never fabricates experience — only reorders and emphasizes what you already have.
            </p>
          )
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
