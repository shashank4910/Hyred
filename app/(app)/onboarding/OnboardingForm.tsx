'use client';

import { useState, useRef, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Upload, FileText, X, Loader2, Sparkles, CheckCircle2, Save, Wand2 } from 'lucide-react';
import type { Preferences, ResumeInsights } from '@/lib/types';

type Initial = { email: string; fullName: string; resumeText: string; preferences: Preferences; insights: ResumeInsights | null; resumeChars: number };
type AiField = 'email' | 'fullName' | 'roles' | 'locations' | 'phone';

export function OnboardingForm({ initial }: { initial: Initial }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [email, setEmail] = useState(initial.email);
  const [fullName, setFullName] = useState(initial.fullName);
  const [resumeText, setResumeText] = useState(initial.resumeText);
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [parsedText, setParsedText] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [roles, setRoles] = useState((initial.preferences.roles ?? []).join(', '));
  const [locations, setLocations] = useState((initial.preferences.locations ?? []).join(', '));
  const [remoteOnly, setRemoteOnly] = useState(initial.preferences.remote_only ?? false);
  const [excludeKeywords, setExcludeKeywords] = useState((initial.preferences.exclude_keywords ?? []).join(', '));
  const [blacklist, setBlacklist] = useState((initial.preferences.blacklist_companies ?? []).join(', '));
  const [minScore, setMinScore] = useState(initial.preferences.min_score ?? 70);
  const [insights, setInsights] = useState<ResumeInsights | null>(initial.insights);
  const [analyzing, setAnalyzing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [aiFields, setAiFields] = useState<Set<AiField>>(new Set());

  function markAi(...fields: AiField[]) { setAiFields(p => { const n = new Set(p); fields.forEach(f => n.add(f)); return n; }); }
  function clearAi(field: AiField) { setAiFields(p => { if (!p.has(field)) return p; const n = new Set(p); n.delete(field); return n; }); }

  function applyInsights(ins: ResumeInsights, force = false) {
    const filled: AiField[] = [];
    if (ins.email && (force || !email)) { setEmail(ins.email); filled.push('email'); }
    if (ins.full_name && (force || !fullName)) { setFullName(ins.full_name); filled.push('fullName'); }
    if (ins.suggested_roles?.length && (force || !roles)) { setRoles(ins.suggested_roles.join(', ')); filled.push('roles'); }
    if (ins.current_location && (force || !locations)) { setLocations([ins.current_location, 'Remote'].join(', ')); filled.push('locations'); }
    if (filled.length) markAi(...filled);
    return filled.length;
  }

  async function handleFile(file: File | null) {
    if (!file) return;
    if (!/\.(pdf|docx|txt)$/i.test(file.name)) { toast.error('Upload .pdf, .docx, or .txt'); return; }
    if (file.size > 5 * 1024 * 1024) { toast.error('File must be < 5MB'); return; }
    setResumeFile(file);
    setAnalyzing(true);
    const id = toast.loading('Analyzing resume...');
    try {
      const fd = new FormData(); fd.append('resume', file);
      const res = await fetch('/api/profile/parse', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      setParsedText(data.resume_text);
      if (data.insights) { const ins = data.insights as ResumeInsights; setInsights(ins); const c = applyInsights(ins); toast.success(c > 0 ? `Auto-filled ${c} field${c === 1 ? '' : 's'}` : 'Analyzed', { id }); }
      else { toast.warning('Resume parsed. AI auto-fill unavailable.', { id, duration: 8000 }); }
    } catch (e) { toast.error((e as Error).message, { id }); setResumeFile(null); }
    finally { setAnalyzing(false); }
  }

  async function reanalyze() {
    const text = parsedText || resumeText;
    if (!text || text.length < 50) { toast.error('No resume to analyze'); return; }
    setAnalyzing(true);
    const id = toast.loading('Re-analyzing...');
    try {
      const res = await fetch('/api/profile/parse', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ resume_text: text }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      if (!data.insights) { toast.warning('AI unavailable', { id }); return; }
      const ins = data.insights as ResumeInsights; setInsights(ins);
      const c = applyInsights(ins, true);
      toast.success(c > 0 ? `Refreshed ${c} field${c === 1 ? '' : 's'}` : 'Done', { id });
    } catch (e) { toast.error((e as Error).message, { id }); }
    finally { setAnalyzing(false); }
  }

  async function save() {
    if (!email) { toast.error('Email required'); return; }
    if (!resumeFile && !resumeText.trim() && !parsedText) { toast.error('Upload a resume'); return; }
    const prefs: Preferences = { roles: csv(roles), locations: csv(locations), remote_only: remoteOnly, exclude_keywords: csv(excludeKeywords), blacklist_companies: csv(blacklist), min_score: Number(minScore) || 70 };
    setSaving(true);
    const id = toast.loading('Saving...');
    try {
      const fd = new FormData();
      fd.append('email', email); fd.append('full_name', fullName); fd.append('preferences', JSON.stringify(prefs));
      if (insights) fd.append('insights', JSON.stringify(insights));
      if (resumeFile) fd.append('resume', resumeFile); else fd.append('resume_text', parsedText || resumeText);
      const res = await fetch('/api/profile', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      if (data.profile?.insights) setInsights(data.profile.insights);
      toast.success(data.reembedded ? `Saved · embedded (${data.resume_chars.toLocaleString()} chars)` : 'Saved', { id });
      setResumeFile(null); setAiFields(new Set());
      startTransition(() => router.refresh());
    } catch (e) { toast.error((e as Error).message, { id }); }
    finally { setSaving(false); }
  }

  return (
    <div className="space-y-6">
      {insights && <InsightsPanel insights={insights} onReanalyze={reanalyze} analyzing={analyzing} />}

      {/* Resume upload */}
      <div className="card">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-body font-semibold text-ink flex items-center gap-2"><FileText className="h-4 w-4 text-amber" /> Resume</h2>
          {analyzing && <span className="text-caption text-amber flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> Analyzing</span>}
        </div>
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files[0]); }}
          onClick={() => !analyzing && fileInputRef.current?.click()}
          className={`rounded-card border-2 border-dashed p-8 text-center cursor-pointer transition-colors ${analyzing ? 'border-amber/60 bg-amber/5' : dragOver ? 'border-amber bg-amber/5' : 'border-faded-stone hover:border-amber/40'}`}
        >
          <input ref={fileInputRef} type="file" accept=".pdf,.docx,.txt" onChange={(e) => handleFile(e.target.files?.[0] ?? null)} className="hidden" />
          {resumeFile ? (
            <div className="flex items-center justify-center gap-2 text-body-sm">
              <FileText className="h-4 w-4 text-amber" />
              <span className="text-ink truncate">{resumeFile.name}</span>
              <span className="text-caption text-stone">({(resumeFile.size / 1024).toFixed(0)}KB)</span>
              {!analyzing && <button onClick={(e) => { e.stopPropagation(); setResumeFile(null); setParsedText(''); }} className="text-stone hover:text-warning-red"><X className="h-4 w-4" /></button>}
            </div>
          ) : (
            <div>
              <Upload className="h-6 w-6 mx-auto text-shadow-tint mb-2" />
              <p className="text-body-sm text-ink">Drop your resume or <span className="text-amber font-medium">browse</span></p>
              <p className="text-caption text-stone mt-1">.pdf, .docx, .txt · max 5MB</p>
            </div>
          )}
        </div>
        {initial.resumeChars > 0 && !resumeFile && (
          <p className="text-caption text-stone mt-3 flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> Resume on file ({initial.resumeChars.toLocaleString()} chars)</p>
        )}
      </div>

      {/* About you */}
      <div className="card">
        <h2 className="text-body font-semibold text-ink mb-5">About you</h2>
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Email" ai={aiFields.has('email')}><input className="input" value={email} onChange={(e) => { setEmail(e.target.value); clearAi('email'); }} type="email" placeholder="you@example.com" required /></Field>
          <Field label="Full name" ai={aiFields.has('fullName')}><input className="input" value={fullName} onChange={(e) => { setFullName(e.target.value); clearAi('fullName'); }} placeholder="Your name" /></Field>
        </div>
      </div>

      {/* Preferences */}
      <div className="card">
        <h2 className="text-body font-semibold text-ink mb-5">Job preferences</h2>
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Target roles" hint="Comma separated" ai={aiFields.has('roles')}><input className="input" value={roles} onChange={(e) => { setRoles(e.target.value); clearAi('roles'); }} placeholder="SRE Lead, Platform Engineer" /></Field>
          <Field label="Locations" hint="Comma separated" ai={aiFields.has('locations')}><input className="input" value={locations} onChange={(e) => { setLocations(e.target.value); clearAi('locations'); }} placeholder="India, Remote" /></Field>
          <Field label="Exclude keywords"><input className="input" value={excludeKeywords} onChange={(e) => setExcludeKeywords(e.target.value)} placeholder="Junior, Intern" /></Field>
          <Field label="Blacklist companies"><input className="input" value={blacklist} onChange={(e) => setBlacklist(e.target.value)} placeholder="Company A, Company B" /></Field>
        </div>
        <div className="grid sm:grid-cols-2 gap-4 mt-4 items-end">
          <Field label={`Min score: ${minScore}`}><input type="range" min={50} max={95} step={5} value={minScore} onChange={(e) => setMinScore(Number(e.target.value))} className="w-full accent-amber" /></Field>
          <label className="flex items-center gap-2 text-body-sm text-ink cursor-pointer"><input type="checkbox" checked={remoteOnly} onChange={(e) => setRemoteOnly(e.target.checked)} className="accent-amber h-4 w-4" /> Remote only</label>
        </div>
      </div>

      <div className="flex justify-end">
        <button onClick={save} disabled={saving} className="btn-primary">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {saving ? 'Saving...' : 'Save profile'}
        </button>
      </div>
    </div>
  );
}

function Field({ label, hint, ai, children }: { label: string; hint?: string; ai?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label className="text-caption text-stone font-medium">{label}</label>
        {ai && <span className="text-caption text-amber flex items-center gap-0.5"><Sparkles className="h-2.5 w-2.5" /> AI</span>}
      </div>
      {children}
      {hint && <p className="text-caption text-stone mt-1">{hint}</p>}
    </div>
  );
}

function InsightsPanel({ insights, onReanalyze, analyzing }: { insights: ResumeInsights; onReanalyze: () => void; analyzing: boolean }) {
  return (
    <div className="card border-l-4 border-l-amber">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <h2 className="text-body font-semibold text-sunset-orange flex items-center gap-2"><Sparkles className="h-4 w-4" /> Resume insights</h2>
        <button onClick={onReanalyze} disabled={analyzing} className="btn">{analyzing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Wand2 className="h-3 w-3" />} Re-analyze</button>
      </div>
      {insights.summary && <p className="text-body-sm text-ink mb-4">{insights.summary}</p>}
      <div className="grid sm:grid-cols-3 gap-3">
        {insights.years_experience != null && <KV label="Experience" value={`${insights.years_experience} years`} />}
        {insights.seniority && <KV label="Seniority" value={insights.seniority} />}
        {insights.current_location && <KV label="Location" value={insights.current_location} />}
      </div>
      {insights.top_skills?.length ? (
        <div className="mt-4"><p className="text-caption text-stone mb-2">Skills</p><div className="flex flex-wrap gap-1.5">{insights.top_skills.map(s => <span key={s} className="badge-warm">{s}</span>)}</div></div>
      ) : null}
    </div>
  );
}

function KV({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-btn border border-faded-stone bg-off-white px-3 py-2">
      <div className="text-caption text-stone">{label}</div>
      <div className="text-body-sm font-medium text-ink capitalize">{value}</div>
    </div>
  );
}

function csv(s: string): string[] { return s.split(',').map(x => x.trim()).filter(Boolean); }
