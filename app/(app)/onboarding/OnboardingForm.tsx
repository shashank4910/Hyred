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
} from 'lucide-react';
import type { Preferences, ResumeInsights } from '@/lib/types';

type Initial = {
  email: string;
  fullName: string;
  resumeText: string;
  preferences: Preferences;
  insights: ResumeInsights | null;
  resumeChars: number;
};

export function OnboardingForm({ initial }: { initial: Initial }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Profile fields
  const [email, setEmail] = useState(initial.email);
  const [fullName, setFullName] = useState(initial.fullName);
  const [resumeText, setResumeText] = useState(initial.resumeText);
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);

  // Preferences
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

  // State
  const [insights, setInsights] = useState<ResumeInsights | null>(initial.insights);
  const [saving, setSaving] = useState(false);

  function handleFile(file: File | null) {
    if (!file) return;
    const ext = file.name.toLowerCase();
    if (
      !ext.endsWith('.pdf') &&
      !ext.endsWith('.docx') &&
      !ext.endsWith('.txt')
    ) {
      toast.error('Please upload a .pdf, .docx, or .txt file');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('File must be smaller than 5MB');
      return;
    }
    setResumeFile(file);
  }

  function applyInsightSuggestions() {
    if (!insights) return;
    if (insights.suggested_roles?.length) {
      setRoles(insights.suggested_roles.join(', '));
    }
    toast.success('Suggested roles applied');
  }

  async function save() {
    if (!email) {
      toast.error('Email is required');
      return;
    }
    if (!resumeFile && !resumeText.trim()) {
      toast.error('Upload a resume or paste text');
      return;
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
    const id = toast.loading(
      resumeFile
        ? 'Parsing resume and extracting insights...'
        : 'Embedding and analyzing resume...',
    );
    try {
      const fd = new FormData();
      fd.append('email', email);
      fd.append('full_name', fullName);
      fd.append('preferences', JSON.stringify(prefs));
      if (resumeFile) {
        fd.append('resume', resumeFile);
      } else {
        fd.append('resume_text', resumeText);
      }

      const res = await fetch('/api/profile', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Save failed');

      if (data.profile?.insights) {
        setInsights(data.profile.insights);
      }
      toast.success(
        data.reembedded
          ? `Saved · resume embedded (${data.resume_chars} chars)`
          : 'Preferences saved',
        { id },
      );
      setResumeFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      startTransition(() => router.refresh());
    } catch (e) {
      toast.error((e as Error).message, { id });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      {insights && <InsightsPanel insights={insights} onApply={applyInsightSuggestions} />}

      <section className="card space-y-4">
        <h2 className="font-semibold flex items-center gap-2">
          <FileText className="h-4 w-4 text-primary" /> Resume
        </h2>

        {/* File upload */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            handleFile(e.dataTransfer.files[0] ?? null);
          }}
          className={
            'rounded-lg border-2 border-dashed p-6 text-center transition-colors cursor-pointer ' +
            (dragOver
              ? 'border-primary bg-primary/5'
              : 'border-border hover:border-primary/40')
          }
          onClick={() => fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
            onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
            className="hidden"
          />
          {resumeFile ? (
            <div className="flex items-center justify-center gap-2 text-sm">
              <FileText className="h-4 w-4 text-primary" />
              <span className="truncate">{resumeFile.name}</span>
              <span className="text-muted text-xs">
                ({(resumeFile.size / 1024).toFixed(0)}KB)
              </span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setResumeFile(null);
                  if (fileInputRef.current) fileInputRef.current.value = '';
                }}
                className="ml-2 text-muted hover:text-red-300"
                aria-label="Remove"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <div>
              <Upload className="h-6 w-6 mx-auto text-muted mb-2" />
              <p className="text-sm">
                Drop your resume here or{' '}
                <span className="text-primary">click to browse</span>
              </p>
              <p className="text-xs text-muted mt-1">
                .pdf, .docx, or .txt · max 5MB
              </p>
            </div>
          )}
        </div>

        {initial.resumeChars > 0 && !resumeFile && (
          <p className="text-xs text-muted inline-flex items-center gap-1">
            <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
            Resume on file ({initial.resumeChars.toLocaleString()} chars). Upload a
            new file to replace.
          </p>
        )}

        <details className="text-xs">
          <summary className="cursor-pointer text-muted hover:text-fg">
            Or paste resume text
          </summary>
          <textarea
            className="input mt-2 min-h-[200px] font-mono text-xs"
            value={resumeText}
            onChange={(e) => setResumeText(e.target.value)}
            placeholder="Paste your full resume here..."
          />
          <p className="text-xs text-muted mt-1">{resumeText.length} chars</p>
        </details>
      </section>

      <section className="card space-y-3">
        <h2 className="font-semibold">About you</h2>
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-muted">Email</label>
            <input
              className="input mt-1"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              placeholder="you@example.com"
              required
            />
          </div>
          <div>
            <label className="text-xs text-muted">Full name</label>
            <input
              className="input mt-1"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Shashank Singh"
            />
          </div>
        </div>
      </section>

      <section className="card space-y-3">
        <h2 className="font-semibold">Job preferences</h2>
        <div className="grid sm:grid-cols-2 gap-3">
          <Field
            label="Target roles"
            hint="Comma separated. Used by the LLM to focus matching."
          >
            <input
              className="input"
              value={roles}
              onChange={(e) => setRoles(e.target.value)}
              placeholder="Senior Performance Engineer, SRE Lead"
            />
          </Field>
          <Field label="Preferred locations" hint="Comma separated.">
            <input
              className="input"
              value={locations}
              onChange={(e) => setLocations(e.target.value)}
              placeholder="India, Remote, Bangalore"
            />
          </Field>
          <Field label="Avoid keywords" hint="Skips JDs mentioning these.">
            <input
              className="input"
              value={excludeKeywords}
              onChange={(e) => setExcludeKeywords(e.target.value)}
              placeholder="Junior, Intern, Contract"
            />
          </Field>
          <Field
            label="Blacklisted companies"
            hint="Never show jobs from these companies."
          >
            <input
              className="input"
              value={blacklist}
              onChange={(e) => setBlacklist(e.target.value)}
              placeholder="Company A, Company B"
            />
          </Field>
        </div>
        <div className="grid sm:grid-cols-2 gap-3 items-end">
          <Field label={`Minimum score to keep: ${minScore}`}>
            <input
              type="range"
              min={50}
              max={95}
              step={5}
              value={minScore}
              onChange={(e) => setMinScore(Number(e.target.value))}
              className="w-full accent-[#7cffb2]"
            />
          </Field>
          <label className="inline-flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={remoteOnly}
              onChange={(e) => setRemoteOnly(e.target.checked)}
              className="accent-[#7cffb2]"
            />
            Remote only
          </label>
        </div>
      </section>

      <div className="flex justify-end sticky bottom-4">
        <button onClick={save} disabled={saving} className="btn-primary shadow-lg">
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          {saving ? 'Saving...' : 'Save profile'}
        </button>
      </div>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="text-xs text-muted">{label}</label>
      <div className="mt-1">{children}</div>
      {hint && <p className="text-xs text-muted mt-1">{hint}</p>}
    </div>
  );
}

function InsightsPanel({
  insights,
  onApply,
}: {
  insights: ResumeInsights;
  onApply: () => void;
}) {
  return (
    <section className="card border-primary/30 bg-primary/5 space-y-3 animate-fade-in">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-semibold flex items-center gap-2 text-primary">
          <Sparkles className="h-4 w-4" /> Resume insights
        </h2>
        {insights.suggested_roles?.length ? (
          <button onClick={onApply} className="btn">
            Apply suggested roles
          </button>
        ) : null}
      </div>
      {insights.summary && (
        <p className="text-sm text-fg/90">{insights.summary}</p>
      )}
      <div className="grid sm:grid-cols-3 gap-3 text-sm">
        {insights.years_experience != null && (
          <KV label="Experience" value={`${insights.years_experience} years`} />
        )}
        {insights.seniority && (
          <KV
            label="Seniority"
            value={insights.seniority}
            capitalize
          />
        )}
        {insights.top_skills && insights.top_skills.length > 0 && (
          <KV label="Top skills" value={`${insights.top_skills.length} extracted`} />
        )}
      </div>
      {insights.top_skills && insights.top_skills.length > 0 && (
        <div>
          <div className="text-xs text-muted mb-1">Skills detected</div>
          <div className="flex flex-wrap gap-1.5">
            {insights.top_skills.map((s) => (
              <span key={s} className="badge-primary">
                {s}
              </span>
            ))}
          </div>
        </div>
      )}
      {insights.suggested_roles && insights.suggested_roles.length > 0 && (
        <div>
          <div className="text-xs text-muted mb-1">Suggested target roles</div>
          <div className="flex flex-wrap gap-1.5">
            {insights.suggested_roles.map((r) => (
              <span key={r} className="badge">
                {r}
              </span>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function KV({
  label,
  value,
  capitalize,
}: {
  label: string;
  value: string;
  capitalize?: boolean;
}) {
  return (
    <div className="rounded-md border border-border bg-bg/40 px-3 py-2">
      <div className="text-xs text-muted">{label}</div>
      <div className={`font-medium ${capitalize ? 'capitalize' : ''}`}>{value}</div>
    </div>
  );
}

function csvToList(s: string): string[] {
  return s
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
}
