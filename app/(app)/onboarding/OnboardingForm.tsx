'use client';

import { useState, useRef, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  Upload,
  FileText,
  X,
  Loader2,
  Sparkles,
  CheckCircle2,
  Save,
  Wand2,
} from 'lucide-react';
import type { Preferences, ResumeInsights } from '@/lib/types';
import { isResumeFilename, RESUME_FILE_ACCEPT } from '@/lib/resume-upload';
import { triggerJobScan } from '../_components/triggerJobScan';

type Initial = {
  email: string;
  fullName: string;
  resumeText: string;
  preferences: Preferences;
  insights: ResumeInsights | null;
  resumeChars: number;
};

type AiField = 'email' | 'fullName' | 'roles' | 'locations' | 'phone';

export function OnboardingForm({ initial }: { initial: Initial }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [email, setEmail] = useState(initial.email);
  const [fullName, setFullName] = useState(initial.fullName);
  const [resumeText, setResumeText] = useState(initial.resumeText);
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [parsedText, setParsedText] = useState<string>('');
  const [dragOver, setDragOver] = useState(false);

  const [roles, setRoles] = useState((initial.preferences.roles ?? []).join(', '));
  const [locations, setLocations] = useState(
    (initial.preferences.locations ?? []).join(', '),
  );
  const [remoteOnly, setRemoteOnly] = useState(
    initial.preferences.remote_only ?? false,
  );
  const [excludeKeywords, setExcludeKeywords] = useState(
    (initial.preferences.exclude_keywords ?? []).join(', '),
  );
  const [blacklist, setBlacklist] = useState(
    (initial.preferences.blacklist_companies ?? []).join(', '),
  );
  const [minScore, setMinScore] = useState(initial.preferences.min_score ?? 70);

  const [insights, setInsights] = useState<ResumeInsights | null>(initial.insights);
  const [analyzing, setAnalyzing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [aiFields, setAiFields] = useState<Set<AiField>>(new Set());


  function markAiFilled(...fields: AiField[]) {
    setAiFields((prev) => {
      const next = new Set(prev);
      fields.forEach((f) => next.add(f));
      return next;
    });
  }

  function clearAiFlag(field: AiField) {
    setAiFields((prev) => {
      if (!prev.has(field)) return prev;
      const next = new Set(prev);
      next.delete(field);
      return next;
    });
  }

  function applyInsights(ins: ResumeInsights, force = false) {
    const filled: AiField[] = [];
    if (ins.email && (force || !email)) { setEmail(ins.email); filled.push('email'); }
    if (ins.full_name && (force || !fullName)) { setFullName(ins.full_name); filled.push('fullName'); }
    if (ins.suggested_roles?.length && (force || !roles)) {
      setRoles(ins.suggested_roles.join(', ')); filled.push('roles');
    }
    if (ins.current_location && (force || !locations)) {
      setLocations([ins.current_location, 'Remote'].join(', ')); filled.push('locations');
    }
    if (filled.length) markAiFilled(...filled);
    return filled.length;
  }

  async function handleFile(file: File | null) {
    if (!file) return;
    if (!isResumeFilename(file.name)) {
      toast.error('Please upload a .pdf, .doc, .docx, or .txt file'); return;
    }
    if (file.size > 5 * 1024 * 1024) { toast.error('File must be smaller than 5MB'); return; }
    setResumeFile(file);
    await analyzeFile(file);
  }

  async function analyzeFile(file: File) {
    setAnalyzing(true);
    const id = toast.loading('Analyzing your resume...');
    try {
      const fd = new FormData();
      fd.append('resume', file);
      const res = await fetch('/api/profile/parse', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Analysis failed');
      setParsedText(data.resume_text);
      if (data.insights) {
        const ins = data.insights as ResumeInsights;
        setInsights(ins);
        // Force refresh roles/locations from the uploaded file — stale adopted
        // preferences (e.g. HR roles from a deleted/re-linked account) must not
        // block updating target roles for this resume.
        const count = applyInsights(ins, true);
        toast.success(count > 0 ? `Auto-filled ${count} field${count === 1 ? '' : 's'} from resume` : 'Resume analyzed', { id });
      } else {
        const detail = data.analysis_error ? truncate(data.analysis_error, 220) : 'AI auto-fill is unavailable right now.';
        toast.warning(`Resume parsed. ${detail}`, { id, duration: 12000 });
      }
    } catch (e) {
      toast.error((e as Error).message, { id });
      setResumeFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    } finally { setAnalyzing(false); }
  }


  async function reanalyze() {
    const text = parsedText || resumeText;
    if (!text || text.length < 50) { toast.error('No resume content to analyze'); return; }
    setAnalyzing(true);
    const id = toast.loading('Re-analyzing...');
    try {
      const res = await fetch('/api/profile/parse', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ resume_text: text }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      if (!data.insights) {
        toast.warning(data.analysis_error ? `AI unavailable: ${truncate(data.analysis_error, 100)}` : 'AI returned no insights', { id, duration: 8000 });
        return;
      }
      const ins = data.insights as ResumeInsights;
      setInsights(ins);
      const count = applyInsights(ins, true);
      toast.success(count > 0 ? `Refreshed ${count} field${count === 1 ? '' : 's'}` : 'Done', { id });
    } catch (e) { toast.error((e as Error).message, { id }); }
    finally { setAnalyzing(false); }
  }

  async function save() {
    if (!email) { toast.error('Email is required'); return; }
    if (!resumeFile && !resumeText.trim() && !parsedText) {
      toast.error('Upload a resume or paste text'); return;
    }
    const prefs: Preferences = {
      roles: csvToList(roles),
      locations: csvToList(locations),
      remote_only: remoteOnly,
      exclude_keywords: csvToList(excludeKeywords),
      blacklist_companies: csvToList(blacklist),
      min_score: Number(minScore) || 70,
    };
    setSaving(true);
    const id = toast.loading('Saving profile...');
    try {
      const fd = new FormData();
      fd.append('email', email);
      fd.append('full_name', fullName);
      fd.append('preferences', JSON.stringify(prefs));
      if (insights) fd.append('insights', JSON.stringify(insights));
      if (resumeFile) { fd.append('resume', resumeFile); }
      else { fd.append('resume_text', parsedText || resumeText); }
      const res = await fetch('/api/profile', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Save failed');
      if (data.profile?.insights) setInsights(data.profile.insights);
      const isFirstResume = initial.resumeChars === 0 && data.reembedded;
      toast.success(
        data.reembedded
          ? isFirstResume
            ? `Profile saved · resume ready (${data.resume_chars.toLocaleString()} chars)`
            : `Saved · resume embedded (${data.resume_chars.toLocaleString()} chars)`
          : 'Preferences saved',
        { id },
      );
      setResumeFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      setAiFields(new Set());
      startTransition(() => router.refresh());

      // First resume upload: auto-scan so new users see matches without clicking Run scan.
      if (isFirstResume) {
        void triggerJobScan({
          autoFlow: true,
          onComplete: (result) => {
            if (result.matchesCreated > 0) {
              startTransition(() => router.push('/'));
            }
          },
        });
      }
    } catch (e) { toast.error((e as Error).message, { id }); }
    finally { setSaving(false); }
  }


  return (
    <div className="space-y-5">
      {insights && (
        <InsightsPanel insights={insights} onReanalyze={reanalyze} analyzing={analyzing} />
      )}

      <section className="card space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-ink flex items-center gap-2">
            <FileText className="h-4 w-4 text-amber" /> Resume
          </h2>
          {analyzing && (
            <span className="inline-flex items-center gap-1.5 text-xs text-amber font-medium">
              <Loader2 className="h-3 w-3 animate-spin" /> Analyzing with AI
            </span>
          )}
        </div>

        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files[0] ?? null); }}
          className={
            'rounded-card border-2 border-dashed p-6 text-center transition-colors cursor-pointer ' +
            (analyzing
              ? 'border-amber/60 bg-amber/5 animate-pulse'
              : dragOver
                ? 'border-amber bg-amber/5'
                : 'border-faded-stone hover:border-amber/40')
          }
          onClick={() => !analyzing && fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept={RESUME_FILE_ACCEPT}
            onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
            className="hidden"
          />
          {resumeFile ? (
            <div className="flex items-center justify-center gap-2 text-sm">
              <FileText className="h-4 w-4 text-amber" />
              <span className="truncate text-ink">{resumeFile.name}</span>
              <span className="text-stone text-xs">({(resumeFile.size / 1024).toFixed(0)}KB)</span>
              {!analyzing && (
                <button
                  onClick={(e) => { e.stopPropagation(); setResumeFile(null); setParsedText(''); if (fileInputRef.current) fileInputRef.current.value = ''; }}
                  className="ml-2 text-stone hover:text-warning-red"
                  aria-label="Remove"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          ) : (
            <div>
              <Upload className="h-6 w-6 mx-auto text-shadow-tint mb-2" />
              <p className="text-sm text-ink">
                Drop your resume here or <span className="text-amber font-medium">click to browse</span>
              </p>
              <p className="text-xs text-stone mt-1">
                .pdf, .doc, .docx, or .txt · max 5MB · AI auto-fills your details
              </p>
            </div>
          )}
        </div>

        {initial.resumeChars > 0 && !resumeFile && (
          <p className="text-xs text-stone inline-flex items-center gap-1">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
            Resume on file ({initial.resumeChars.toLocaleString()} chars). Upload a new file to replace.
          </p>
        )}

        <details className="text-xs">
          <summary className="cursor-pointer text-stone hover:text-ink font-medium">Or paste resume text</summary>
          <textarea
            className="input mt-2 min-h-[200px] font-mono text-xs"
            value={resumeText}
            onChange={(e) => setResumeText(e.target.value)}
            placeholder="Paste your full resume here..."
          />
          <div className="flex items-center justify-between mt-1">
            <p className="text-xs text-stone">{resumeText.length} chars</p>
            {resumeText.length >= 200 && (
              <button type="button" onClick={reanalyze} disabled={analyzing} className="btn">
                {analyzing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Wand2 className="h-3 w-3" />}
                Analyze pasted text
              </button>
            )}
          </div>
        </details>
      </section>


      <section className="card space-y-3">
        <h2 className="font-semibold text-ink">About you</h2>
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Email" ai={aiFields.has('email')}>
            <input className="input" value={email} onChange={(e) => { setEmail(e.target.value); clearAiFlag('email'); }} type="email" placeholder="you@example.com" required />
          </Field>
          <Field label="Full name" ai={aiFields.has('fullName')}>
            <input className="input" value={fullName} onChange={(e) => { setFullName(e.target.value); clearAiFlag('fullName'); }} placeholder="Your full name" />
          </Field>
        </div>
      </section>

      <section className="card space-y-3">
        <h2 className="font-semibold text-ink">Job preferences</h2>
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Target roles" hint="Comma separated. Used by the LLM to focus matching." ai={aiFields.has('roles')}>
            <input className="input" value={roles} onChange={(e) => { setRoles(e.target.value); clearAiFlag('roles'); }} placeholder="e.g. Senior Software Engineer, Product Manager" />
          </Field>
          <Field label="Preferred locations" hint="Comma separated. Used to personalise your LinkedIn job search — e.g. Bengaluru, Mumbai, Remote." ai={aiFields.has('locations')}>
            <input className="input" value={locations} onChange={(e) => { setLocations(e.target.value); clearAiFlag('locations'); }} placeholder="e.g. Bengaluru, Mumbai, Remote" />
          </Field>
          <Field label="Avoid keywords" hint="Skips JDs mentioning these.">
            <input className="input" value={excludeKeywords} onChange={(e) => setExcludeKeywords(e.target.value)} placeholder="Junior, Intern, Contract" />
          </Field>
          <Field label="Blacklisted companies" hint="Never show jobs from these companies.">
            <input className="input" value={blacklist} onChange={(e) => setBlacklist(e.target.value)} placeholder="Company A, Company B" />
          </Field>
        </div>
        <div className="grid sm:grid-cols-2 gap-3 items-end">
          <Field label={`Minimum score to keep: ${minScore}`}>
            <input type="range" min={50} max={95} step={5} value={minScore} onChange={(e) => setMinScore(Number(e.target.value))} className="w-full accent-amber" />
          </Field>
          <label className="inline-flex items-center gap-2 text-sm text-ink">
            <input type="checkbox" checked={remoteOnly} onChange={(e) => setRemoteOnly(e.target.checked)} className="accent-amber" />
            Remote only
          </label>
        </div>
      </section>

      <div className="flex justify-end sticky bottom-4">
        <button
          onClick={save}
          disabled={saving}
          className="btn-primary shadow-card"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {saving ? 'Saving...' : 'Save profile'}
        </button>
      </div>
    </div>
  );
}


function Field({
  label,
  hint,
  ai,
  children,
}: {
  label: string;
  hint?: string;
  ai?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center justify-between">
        <label className="text-xs text-stone font-medium">{label}</label>
        {ai && (
          <span className="inline-flex items-center gap-0.5 text-[10px] text-amber font-medium" title="Auto-filled by AI from your resume. Edit to override.">
            <Sparkles className="h-2.5 w-2.5" /> AI
          </span>
        )}
      </div>
      <div className="mt-1">{children}</div>
      {hint && <p className="text-xs text-stone mt-1">{hint}</p>}
    </div>
  );
}

function InsightsPanel({
  insights,
  onReanalyze,
  analyzing,
}: {
  insights: ResumeInsights;
  onReanalyze: () => void;
  analyzing: boolean;
}) {
  return (
    <section className="card border-amber/30 bg-amber/5 space-y-3 animate-fade-in">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="font-semibold flex items-center gap-2 text-amber-hover">
          <Sparkles className="h-4 w-4" /> Resume insights
        </h2>
        <button onClick={onReanalyze} disabled={analyzing} className="btn">
          {analyzing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Wand2 className="h-3 w-3" />}
          Re-analyze
        </button>
      </div>
      {insights.summary && <p className="text-sm text-ink">{insights.summary}</p>}
      <div className="grid sm:grid-cols-3 gap-3 text-sm">
        {insights.years_experience != null && <KV label="Experience" value={`${insights.years_experience} years`} />}
        {insights.seniority && <KV label="Seniority" value={insights.seniority} capitalize />}
        {insights.current_location && <KV label="Location" value={insights.current_location} />}
      </div>
      {insights.top_skills && insights.top_skills.length > 0 && (
        <div>
          <div className="text-xs text-stone mb-1 font-medium">Skills detected</div>
          <div className="flex flex-wrap gap-1.5">
            {insights.top_skills.map((s) => (<span key={s} className="badge-primary">{s}</span>))}
          </div>
        </div>
      )}
      {insights.suggested_roles && insights.suggested_roles.length > 0 && (
        <div>
          <div className="text-xs text-stone mb-1 font-medium">Suggested target roles</div>
          <div className="flex flex-wrap gap-1.5">
            {insights.suggested_roles.map((r) => (<span key={r} className="badge">{r}</span>))}
          </div>
        </div>
      )}
    </section>
  );
}


function KV({ label, value, capitalize }: { label: string; value: string; capitalize?: boolean }) {
  return (
    <div className="rounded-btn border border-border bg-off-white px-3 py-2">
      <div className="text-xs text-stone">{label}</div>
      <div className={`font-medium text-ink ${capitalize ? 'capitalize' : ''}`}>{value}</div>
    </div>
  );
}

function csvToList(s: string): string[] {
  return s.split(',').map((x) => x.trim()).filter(Boolean);
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}
