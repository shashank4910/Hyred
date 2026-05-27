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
  RotateCw,
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

  const [letter, setLetter] = useState(coverLetter ?? '');
  const [editing, setEditing] = useState(false);
  const [generating, setGenerating] = useState(false);

  const [notesValue, setNotesValue] = useState(notes ?? '');
  const [savingNotes, setSavingNotes] = useState(false);
  const [notesDirty, setNotesDirty] = useState(false);

  const [skills, setSkills] = useState<Skills>(null);
  const [analyzingSkills, setAnalyzingSkills] = useState(false);

  const [atsResume, setAtsResume] = useState('');
  const [generatingResume, setGeneratingResume] = useState(false);
  const [resumeCopied, setResumeCopied] = useState(false);
  const [keywords, setKeywords] = useState<{
    added: string[];
    already_had: string[];
    total_jd_keywords: number;
    selected_count?: number;
  } | null>(null);

  const [jdKeywords, setJdKeywords] = useState<string[]>([]);
  const [alreadyHaveKeywords, setAlreadyHaveKeywords] = useState<string[]>([]);
  const [selectedKeywords, setSelectedKeywords] = useState<string[]>([]);
  const [loadingKeywords, setLoadingKeywords] = useState(false);
  const [keywordsLoaded, setKeywordsLoaded] = useState(false);

  const [editingResume, setEditingResume] = useState(false);
  const [editedResume, setEditedResume] = useState('');

  useEffect(() => {
    if (!candidateSkills.length) return;
    let cancelled = false;
    setAnalyzingSkills(true);
    fetch(`/api/match/${matchId}/skills`, { method: 'POST' })
      .then((r) => r.json())
      .then((d) => { if (!cancelled && d?.matched != null) setSkills(d as Skills); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setAnalyzingSkills(false); });
    return () => { cancelled = true; };
  }, [matchId, candidateSkills.length]);

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
      const res = await fetch('/api/coverletter', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ match_id: matchId }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      setLetter(data.cover_letter);
      toast.success('Cover letter ready', { id });
      startTransition(() => router.refresh());
    } catch (e) { toast.error((e as Error).message, { id }); }
    finally { setGenerating(false); }
  }

  async function setStatusFn(next: string) {
    const id = toast.loading('Updating...');
    try {
      const res = await fetch(`/api/match/${matchId}/status`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ status: next }) });
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || 'Failed'); }
      toast.success(`Marked as ${next}`, { id });
      startTransition(() => router.refresh());
    } catch (e) { toast.error((e as Error).message, { id }); }
  }

  async function saveNotes() {
    setSavingNotes(true);
    try {
      const res = await fetch(`/api/match/${matchId}/notes`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ notes: notesValue }) });
      if (!res.ok) throw new Error('Failed');
      toast.success('Notes saved');
      setNotesDirty(false);
    } catch (e) { toast.error((e as Error).message); }
    finally { setSavingNotes(false); }
  }

  async function copyLetter() { await navigator.clipboard.writeText(letter); toast.success('Copied'); }
  function downloadLetter() {
    const blob = new Blob([letter], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'cover-letter.txt'; a.click();
    URL.revokeObjectURL(url);
  }

  async function generateAtsResume() {
    setGeneratingResume(true);
    const id = toast.loading('Generating ATS-optimized resume...');
    try {
      const res = await fetch(`/api/match/${matchId}/resume`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ selectedKeywords: selectedKeywords.length > 0 ? selectedKeywords : undefined }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      setAtsResume(data.resume); setEditedResume(data.resume); setEditingResume(true);
      if (data.keywords) setKeywords(data.keywords);
      toast.success('ATS resume ready', { id });
    } catch (e) { toast.error((e as Error).message, { id }); }
    finally { setGeneratingResume(false); }
  }

  async function copyResume() { await navigator.clipboard.writeText(editedResume || atsResume); setResumeCopied(true); toast.success('Copied'); setTimeout(() => setResumeCopied(false), 2000); }
  function downloadResumeTxt() {
    const text = editedResume || atsResume;
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'resume-ats-optimized.txt'; a.click();
    URL.revokeObjectURL(url);
  }
  async function downloadResumePdf() {
    const id = toast.loading('Generating PDF...');
    try {
      const { generateBeautifulPdf } = await import('@/lib/pdf-resume');
      const doc = generateBeautifulPdf(editedResume || atsResume);
      doc.save('resume-ats-optimized.pdf');
      toast.success('PDF downloaded', { id });
    } catch (e) { toast.error(`PDF failed: ${(e as Error).message}`, { id }); }
  }

  return (
    <div className="space-y-4">
      {/* Apply CTA */}
      <div className="card flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="section-title">Ready to apply?</h2>
          <p className="text-caption text-stone mt-1">Opens the original posting. Generate your resume + cover letter first.</p>
        </div>
        <a
          href={applyUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => {
            if (status !== 'applied' && status !== 'interviewing' && status !== 'offer') {
              fetch(`/api/match/${matchId}/status`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ status: 'applied' }) })
                .then(() => startTransition(() => router.refresh())).catch(() => {});
            }
          }}
          className="btn-primary whitespace-nowrap"
        >
          <ExternalLink className="h-4 w-4" /> Apply now
        </a>
      </div>

      {/* Status */}
      <div className="card-compact">
        <div className="flex flex-wrap gap-2">
          {STATUS_ORDER.map((s) => (
            <button
              key={s}
              disabled={s === status}
              onClick={() => setStatusFn(s)}
              className={s === status
                ? 'rounded-btn bg-ink text-off-white px-3 py-[7px] text-caption font-medium capitalize'
                : 'rounded-btn border border-faded-stone px-3 py-[7px] text-caption text-stone capitalize hover:border-ink hover:text-ink transition-colors'
              }
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Skills */}
      {candidateSkills.length > 0 && (
        <div className="card">
          <h2 className="section-title mb-4">Skill match</h2>
          {analyzingSkills && !skills && (
            <div className="space-y-2"><div className="skeleton h-4 w-2/3" /><div className="skeleton h-4 w-1/2" /></div>
          )}
          {skills && (
            <div className="space-y-4">
              {skills.matched.length > 0 && (
                <div>
                  <p className="text-caption text-stone mb-2">Found in your resume ({skills.matched.length}/{skills.matched.length + skills.missing.length})</p>
                  <div className="flex flex-wrap gap-1.5">
                    {skills.matched.map((s) => (
                      <span key={s} className="inline-flex items-center gap-1 rounded-badge bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-[3px] text-caption">
                        <CheckCircle2 className="h-3 w-3" />{s}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {skills.missing.length > 0 && (
                <div>
                  <p className="text-caption text-stone mb-2">Not found in resume</p>
                  <div className="flex flex-wrap gap-1.5">
                    {skills.missing.map((s) => (
                      <span key={s} className="inline-flex items-center gap-1 rounded-badge border border-warning-red/30 bg-red-50 text-warning-red px-2 py-[3px] text-caption">
                        <XCircle className="h-3 w-3" />{s}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Cover letter */}
      <div className="card">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <h2 className="section-title">Cover letter</h2>
          <div className="flex gap-2 flex-wrap">
            {letter && (
              <>
                <button onClick={copyLetter} className="btn"><Copy className="h-3.5 w-3.5" /> Copy</button>
                <button onClick={downloadLetter} className="btn"><Download className="h-3.5 w-3.5" /> Download</button>
                <button onClick={() => setEditing((v) => !v)} className="btn">{editing ? 'Done' : 'Edit'}</button>
              </>
            )}
            <button onClick={generate} disabled={generating} className="btn-primary">
              {generating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : letter ? <RotateCw className="h-3.5 w-3.5" /> : <Sparkles className="h-3.5 w-3.5" />}
              {generating ? 'Drafting...' : letter ? 'Regenerate' : 'Generate'}
            </button>
          </div>
        </div>
        {generating && !letter && <div className="space-y-2"><div className="skeleton h-4 w-full" /><div className="skeleton h-4 w-11/12" /><div className="skeleton h-4 w-3/4" /></div>}
        {letter ? (
          editing ? (
            <textarea value={letter} onChange={(e) => setLetter(e.target.value)} className="input min-h-[260px] font-sans text-body-sm leading-relaxed" />
          ) : (
            <pre className="whitespace-pre-wrap text-body-sm text-stone font-sans leading-relaxed">{letter}</pre>
          )
        ) : (!generating && <p className="text-body-sm text-stone">Click Generate to draft a tailored cover letter.</p>)}
      </div>

      {/* ATS Resume */}
      <div className="card">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <h2 className="section-title">ATS Resume</h2>
          <div className="flex gap-2 flex-wrap">
            {atsResume && (
              <>
                <button onClick={copyResume} className="btn"><Copy className="h-3.5 w-3.5" /> {resumeCopied ? 'Copied!' : 'Copy'}</button>
                <button onClick={downloadResumeTxt} className="btn"><Download className="h-3.5 w-3.5" /> .txt</button>
                <button onClick={downloadResumePdf} className="btn-primary"><Download className="h-3.5 w-3.5" /> PDF</button>
              </>
            )}
            {!atsResume && (
              <button onClick={generateAtsResume} disabled={generatingResume} className="btn-primary">
                {generatingResume ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                {generatingResume ? 'Generating...' : 'Generate ATS Resume'}
              </button>
            )}
          </div>
        </div>

        {!atsResume && !generatingResume && (
          <div className="space-y-4">
            {loadingKeywords && !keywordsLoaded && <div className="space-y-2"><div className="skeleton h-4 w-1/3" /><div className="flex gap-2"><div className="skeleton h-7 w-20" /><div className="skeleton h-7 w-24" /><div className="skeleton h-7 w-16" /></div></div>}
            {keywordsLoaded && jdKeywords.length > 0 && (
              <div className="border border-faded-stone rounded-card p-5 bg-off-white">
                <KeywordPicker keywords={jdKeywords} alreadyHave={alreadyHaveKeywords} selected={selectedKeywords} onSelectionChange={setSelectedKeywords} />
              </div>
            )}
            {keywordsLoaded && jdKeywords.length === 0 && <p className="text-body-sm text-stone">Click Generate ATS Resume to create an optimized version.</p>}
          </div>
        )}

        {generatingResume && !atsResume && <div className="space-y-2 mt-3"><div className="skeleton h-4 w-full" /><div className="skeleton h-4 w-11/12" /><div className="skeleton h-4 w-3/4" /></div>}

        {atsResume && (
          <div className="space-y-4">
            {keywords && (
              <div className="space-y-3 border-b border-faded-stone pb-4">
                <p className="text-caption text-stone">{keywords.total_jd_keywords} keywords detected{keywords.selected_count ? `, ${keywords.selected_count} prioritized` : ''}</p>
                {keywords.added.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">{keywords.added.map((kw) => <span key={kw} className="badge-warm">+ {kw}</span>)}</div>
                )}
              </div>
            )}
            <div className="flex items-center justify-between gap-3">
              <div className="flex gap-3">
                <button onClick={() => setEditingResume(true)} className={editingResume ? 'text-caption font-medium text-ink border-b border-ink pb-0.5' : 'text-caption text-stone hover:text-ink'}>Edit</button>
                <button onClick={() => { setEditingResume(false); setAtsResume(editedResume); }} className={!editingResume ? 'text-caption font-medium text-ink border-b border-ink pb-0.5' : 'text-caption text-stone hover:text-ink'}>Preview</button>
              </div>
              <button onClick={() => { setAtsResume(''); setEditedResume(''); setKeywords(null); setEditingResume(false); }} className="btn-ghost text-caption"><RotateCw className="h-3 w-3" /> Regenerate</button>
            </div>
            {editingResume ? (
              <div className="space-y-3">
                <textarea value={editedResume} onChange={(e) => setEditedResume(e.target.value)} className="input min-h-[400px] font-mono text-body-sm leading-relaxed resize-y" />
                <div className="flex justify-end">
                  <button onClick={() => { setAtsResume(editedResume); setEditingResume(false); toast.success('Saved'); }} className="btn-primary text-caption"><Save className="h-3 w-3" /> Save & Preview</button>
                </div>
              </div>
            ) : (
              <pre className="whitespace-pre-wrap text-body-sm text-stone font-sans leading-relaxed bg-off-white border border-faded-stone rounded-card p-5 max-h-[420px] overflow-y-auto">{editedResume || atsResume}</pre>
            )}
          </div>
        )}
      </div>

      {/* Notes */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="section-title">Notes</h2>
          {notesDirty && (
            <button onClick={saveNotes} disabled={savingNotes} className="btn-primary">
              {savingNotes ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Save
            </button>
          )}
        </div>
        <textarea
          className="input min-h-[120px]"
          value={notesValue}
          onChange={(e) => { setNotesValue(e.target.value); setNotesDirty(true); }}
          placeholder="Recruiter contact, interview prep, follow-up dates..."
        />
      </div>
    </div>
  );
}
