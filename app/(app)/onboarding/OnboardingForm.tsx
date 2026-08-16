'use client';

import {
  useState,
  useRef,
  useTransition,
  useEffect,
  useMemo,
  useCallback,
} from 'react';
import { createPortal } from 'react-dom';
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
  Download,
  AlertTriangle,
} from 'lucide-react';
import type { Preferences, ResumeInsights } from '@/lib/types';
import { parseYearsExperience } from '@/lib/apply-profile';
import {
  PROFILE_SENIORITY_OPTIONS,
  normalizeProfileSeniority,
} from '@/lib/profile-seniority';
import { isResumeFilename, RESUME_FILE_ACCEPT } from '@/lib/resume-upload';
import PremiumSelect from '@/app/_components/ui/PremiumSelect';
import { triggerJobScan } from '../_components/triggerJobScan';

type Initial = {
  email: string;
  fullName: string;
  resumeText: string;
  preferences: Preferences;
  insights: ResumeInsights | null;
  resumeChars: number;
  hasOriginalResume?: boolean;
  originalFilename?: string | null;
};

type AiField = 'email' | 'fullName' | 'roles' | 'locations' | 'phone';

type SaveSource = 'manual' | 'auto';

type FormFields = {
  email: string;
  fullName: string;
  resumeText: string;
  parsedText: string;
  roles: string;
  locations: string;
  remoteOnly: boolean;
  excludeKeywords: string;
  blacklist: string;
  minScore: number;
  insights: ResumeInsights | null;
};

function buildSnapshot(fields: FormFields): string {
  return JSON.stringify({
    email: fields.email.trim(),
    fullName: fields.fullName.trim(),
    resumeText: fields.resumeText.trim(),
    parsedText: fields.parsedText.trim(),
    roles: fields.roles.trim(),
    locations: fields.locations.trim(),
    remoteOnly: fields.remoteOnly,
    excludeKeywords: fields.excludeKeywords.trim(),
    blacklist: fields.blacklist.trim(),
    minScore: fields.minScore,
    insights: fields.insights,
  });
}

export function OnboardingForm({ initial }: { initial: Initial }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingNavRef = useRef<string | null>(null);
  const insightsAutosaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedSnapshotRef = useRef<string>(
    buildSnapshot({
      email: initial.email,
      fullName: initial.fullName,
      resumeText: initial.resumeText,
      parsedText: '',
      roles: (initial.preferences.roles ?? []).join(', '),
      locations: (initial.preferences.locations ?? []).join(', '),
      remoteOnly: initial.preferences.remote_only ?? false,
      excludeKeywords: (initial.preferences.exclude_keywords ?? []).join(', '),
      blacklist: (initial.preferences.blacklist_companies ?? []).join(', '),
      minScore: initial.preferences.min_score ?? 70,
      insights: initial.insights,
    }),
  );
  const [savedVersion, setSavedVersion] = useState(0);

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
  const [insightsPatching, setInsightsPatching] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [hasOriginalResume, setHasOriginalResume] = useState(
    !!initial.hasOriginalResume,
  );
  const [originalFilename, setOriginalFilename] = useState<string | null>(
    initial.originalFilename ?? null,
  );
  const [aiFields, setAiFields] = useState<Set<AiField>>(new Set());
  const [leaveModalOpen, setLeaveModalOpen] = useState(false);

  const formFields = useMemo<FormFields>(
    () => ({
      email,
      fullName,
      resumeText,
      parsedText,
      roles,
      locations,
      remoteOnly,
      excludeKeywords,
      blacklist,
      minScore,
      insights,
    }),
    [
      email,
      fullName,
      resumeText,
      parsedText,
      roles,
      locations,
      remoteOnly,
      excludeKeywords,
      blacklist,
      minScore,
      insights,
    ],
  );

  const isDirty = useMemo(() => {
    void savedVersion;
    if (resumeFile) return true;
    return buildSnapshot(formFields) !== savedSnapshotRef.current;
  }, [formFields, resumeFile, savedVersion]);

  const markSaved = useCallback(
    (overrides?: Partial<FormFields>) => {
      savedSnapshotRef.current = buildSnapshot({ ...formFields, ...overrides });
      setSavedVersion((v) => v + 1);
    },
    [formFields],
  );

  const mainResumeText = (parsedText || resumeText).trim();
  const canDownloadResume = hasOriginalResume || mainResumeText.length >= 50;

  useEffect(() => {
    if (!isDirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [isDirty]);

  useEffect(() => {
    if (!isDirty) return;
    const onClick = (e: MouseEvent) => {
      const anchor = (e.target as HTMLElement).closest('a[href]') as HTMLAnchorElement | null;
      if (!anchor || anchor.dataset.bypassUnsaved === 'true') return;
      const href = anchor.getAttribute('href');
      if (!href || href.startsWith('#') || anchor.target === '_blank') return;
      if (href.startsWith('mailto:') || href.startsWith('tel:')) return;
      let path = href;
      if (href.startsWith('http')) {
        try {
          const url = new URL(href);
          if (url.origin !== window.location.origin) return;
          path = url.pathname + url.search;
        } catch {
          return;
        }
      }
      if (path === '/onboarding' || path.startsWith('/onboarding?')) return;
      e.preventDefault();
      e.stopPropagation();
      pendingNavRef.current = href;
      setLeaveModalOpen(true);
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, [isDirty]);

  useEffect(() => {
    return () => {
      if (insightsAutosaveRef.current) clearTimeout(insightsAutosaveRef.current);
    };
  }, []);

  async function downloadMainResume() {
    setDownloading(true);
    const id = toast.loading(
      hasOriginalResume
        ? 'Preparing your uploaded file…'
        : 'Checking for your uploaded file…',
    );
    try {
      const res = await fetch('/api/profile/resume/original');
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.url) {
        const a = document.createElement('a');
        a.href = data.url as string;
        a.download = (data.filename as string) || 'resume';
        a.rel = 'noopener';
        document.body.appendChild(a);
        a.click();
        a.remove();
        setHasOriginalResume(true);
        if (data.filename) setOriginalFilename(String(data.filename));
        toast.success('Downloaded your uploaded resume', { id });
        return;
      }
      toast.error(
        (data.message as string) ||
          'No original file yet. Upload your resume again and click Save — then Download will match that file.',
        { id, duration: 10000 },
      );
    } catch (e) {
      toast.error(`Download failed: ${(e as Error).message}`, { id });
    } finally {
      setDownloading(false);
    }
  }

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
    if (ins.email && (force || !email)) {
      setEmail(ins.email);
      filled.push('email');
    }
    if (ins.full_name && (force || !fullName)) {
      setFullName(ins.full_name);
      filled.push('fullName');
    }
    if (ins.suggested_roles?.length && (force || !roles)) {
      setRoles(ins.suggested_roles.join(', '));
      filled.push('roles');
    }
    if (ins.current_location && (force || !locations)) {
      setLocations([ins.current_location, 'Remote'].join(', '));
      filled.push('locations');
    }
    if (filled.length) markAiFilled(...filled);
    return filled.length;
  }

  const saveProfile = useCallback(
    async (opts?: {
      source?: SaveSource;
      overrideInsights?: ResumeInsights | null;
      silent?: boolean;
    }): Promise<boolean> => {
      const source = opts?.source ?? 'manual';
      const activeInsights = opts?.overrideInsights ?? insights;

      if (!email) {
        if (source === 'manual') toast.error('Email is required');
        return false;
      }
      if (!resumeFile && !resumeText.trim() && !parsedText) {
        if (source === 'manual') toast.error('Upload a resume or paste text');
        return false;
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
      const toastId =
        source === 'auto'
          ? toast.loading('Saving your profile automatically…')
          : toast.loading('Saving profile...');

      try {
        const fd = new FormData();
        fd.append('email', email);
        fd.append('full_name', fullName);
        fd.append('preferences', JSON.stringify(prefs));
        if (activeInsights) fd.append('insights', JSON.stringify(activeInsights));
        if (resumeFile) {
          fd.append('resume', resumeFile);
        } else {
          fd.append('resume_text', parsedText || resumeText);
        }

        const res = await fetch('/api/profile', { method: 'POST', body: fd });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Save failed');

        const savedInsights = (data.profile?.insights as ResumeInsights | null) ?? activeInsights;
        if (savedInsights) setInsights(savedInsights);
        if (data.original_file_saved) {
          setHasOriginalResume(true);
          if (resumeFile?.name) setOriginalFilename(resumeFile.name);
        }

        const isFirstResume = initial.resumeChars === 0 && data.reembedded;
        if (!opts?.silent) {
          toast.success(
            source === 'auto'
              ? 'Profile saved — job matches will use this resume'
              : data.reembedded
                ? isFirstResume
                  ? `Profile saved · resume ready (${data.resume_chars.toLocaleString()} chars)`
                  : `Saved · resume embedded (${data.resume_chars.toLocaleString()} chars)`
                : 'Preferences saved',
            { id: toastId },
          );
        } else {
          toast.dismiss(toastId);
        }

        setResumeFile(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
        setAiFields(new Set());
        const textSaved = (parsedText || resumeText).trim();
        if (textSaved.length >= 50) {
          setResumeText(textSaved);
          setParsedText('');
        }
        markSaved({ insights: savedInsights, parsedText: '', resumeText: textSaved.length >= 50 ? textSaved : resumeText });
        startTransition(() => router.refresh());

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

        return true;
      } catch (e) {
        const msg = (e as Error).message;
        if (source === 'auto') {
          toast.error(`Auto-save failed — click Save profile. ${msg}`, { id: toastId, duration: 10000 });
        } else {
          toast.error(msg, { id: toastId });
        }
        return false;
      } finally {
        setSaving(false);
      }
    },
    [
      email,
      fullName,
      resumeFile,
      resumeText,
      parsedText,
      roles,
      locations,
      remoteOnly,
      excludeKeywords,
      blacklist,
      minScore,
      insights,
      initial.resumeChars,
      markSaved,
      router,
    ],
  );

  const patchInsights = useCallback(
    (patch: Partial<ResumeInsights>, merged: ResumeInsights) => {
      if (insightsAutosaveRef.current) clearTimeout(insightsAutosaveRef.current);
      insightsAutosaveRef.current = setTimeout(async () => {
        setInsightsPatching(true);
        try {
          const res = await fetch('/api/profile', {
            method: 'PATCH',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ insights: patch }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || 'Could not save');
          const saved = (data.profile?.insights as ResumeInsights | null) ?? merged;
          setInsights(saved);
          markSaved({ insights: saved });
        } catch (e) {
          toast.error(`Could not save experience: ${(e as Error).message}`, { duration: 6000 });
        } finally {
          setInsightsPatching(false);
        }
      }, 500);
    },
    [markSaved],
  );

  function handleInsightsChange(patch: Partial<ResumeInsights>) {
    const merged: ResumeInsights = { ...(insights ?? {}), ...patch };
    if (patch.seniority != null) {
      merged.seniority = normalizeProfileSeniority(patch.seniority);
    }
    if (patch.years_experience !== undefined) {
      const years = parseYearsExperience(patch.years_experience);
      if (years != null) merged.years_experience = years;
      else delete merged.years_experience;
    }
    setInsights(merged);
    patchInsights(patch, merged);
  }

  async function handleFile(file: File | null) {
    if (!file) return;
    if (!isResumeFilename(file.name)) {
      toast.error('Please upload a .pdf, .doc, .docx, or .txt file');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('File must be smaller than 5MB');
      return;
    }
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
        const count = applyInsights(ins, true);
        toast.success(
          count > 0
            ? `Auto-filled ${count} field${count === 1 ? '' : 's'} from resume`
            : 'Resume analyzed',
          { id },
        );
        await saveProfile({ source: 'auto', overrideInsights: ins });
      } else {
        const detail = data.analysis_error
          ? truncate(data.analysis_error, 220)
          : 'AI auto-fill is unavailable right now.';
        toast.warning(`Resume parsed. ${detail}`, { id, duration: 12000 });
        await saveProfile({ source: 'auto', overrideInsights: insights });
      }
    } catch (e) {
      toast.error((e as Error).message, { id });
      setResumeFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    } finally {
      setAnalyzing(false);
    }
  }

  async function reanalyze() {
    const text = parsedText || resumeText;
    if (!text || text.length < 50) {
      toast.error('No resume content to analyze');
      return;
    }
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
        toast.warning(
          data.analysis_error
            ? `AI unavailable: ${truncate(data.analysis_error, 100)}`
            : 'AI returned no insights',
          { id, duration: 8000 },
        );
        return;
      }
      const ins = data.insights as ResumeInsights;
      setInsights(ins);
      const count = applyInsights(ins, true);
      toast.success(
        count > 0 ? `Refreshed ${count} field${count === 1 ? '' : 's'}` : 'Done',
        { id },
      );
      await saveProfile({ source: 'auto', overrideInsights: ins });
    } catch (e) {
      toast.error((e as Error).message, { id });
    } finally {
      setAnalyzing(false);
    }
  }

  function confirmLeave() {
    setLeaveModalOpen(false);
    const href = pendingNavRef.current;
    pendingNavRef.current = null;
    if (href) {
      if (href.startsWith('http')) window.location.href = href;
      else router.push(href);
    }
  }

  return (
    <div className="space-y-5">
      {isDirty && (
        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
          You have unsaved changes. Save your profile so job matches stay aligned with your resume.
        </p>
      )}

      {insights && (
        <InsightsPanel
          insights={insights}
          onInsightsChange={handleInsightsChange}
          onReanalyze={reanalyze}
          analyzing={analyzing}
          insightsPatching={insightsPatching}
        />
      )}

      <section className="card space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-on-surface flex items-center gap-2">
            <FileText className="h-4 w-4 text-primary" /> Resume
          </h2>
          {analyzing && (
            <span className="inline-flex items-center gap-1.5 text-xs text-primary font-medium">
              <Loader2 className="h-3 w-3 animate-spin" /> Analyzing with AI
            </span>
          )}
        </div>

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
            'rounded-2xl border-2 border-dashed p-6 text-center transition-colors cursor-pointer ' +
            (analyzing
              ? 'border-primary/60 bg-primary/5 animate-pulse'
              : dragOver
                ? 'border-primary bg-primary/5'
                : 'border-outline-variant hover:border-primary/40')
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
              <FileText className="h-4 w-4 text-primary" />
              <span className="truncate text-on-surface">{resumeFile.name}</span>
              <span className="text-on-surface-variant text-xs">
                ({(resumeFile.size / 1024).toFixed(0)}KB)
              </span>
              {!analyzing && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setResumeFile(null);
                    setParsedText('');
                    if (fileInputRef.current) fileInputRef.current.value = '';
                  }}
                  className="ml-2 text-on-surface-variant hover:text-error"
                  aria-label="Remove"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          ) : (
            <div>
              <Upload className="h-6 w-6 mx-auto text-text-muted mb-2" />
              <p className="text-sm text-on-surface">
                Drop your resume here or{' '}
                <span className="text-primary font-medium">click to browse</span>
              </p>
              <p className="text-xs text-on-surface-variant mt-1">
                .pdf, .doc, .docx, or .txt · max 5MB · saves automatically after analysis
              </p>
            </div>
          )}
        </div>

        {canDownloadResume && !resumeFile && (
          <div className="flex flex-wrap items-center gap-2 justify-between">
            <p className="text-xs text-on-surface-variant inline-flex items-center gap-1 min-w-0">
              <CheckCircle2 className="h-3.5 w-3.5 text-match-success shrink-0" />
              <span>
                {hasOriginalResume
                  ? `Uploaded file ready${originalFilename ? ` (${originalFilename})` : ''}. Download gives you that exact file.`
                  : initial.resumeChars > 0
                    ? `Resume text on file (${mainResumeText.length.toLocaleString()} chars). Re-upload + Save once to keep the exact file for download.`
                    : `Resume ready (${mainResumeText.length.toLocaleString()} chars). Save after uploading a file to enable exact download.`}
              </span>
            </p>
            <button
              type="button"
              onClick={downloadMainResume}
              disabled={downloading}
              className="btn btn-secondary text-xs shrink-0"
              title={
                hasOriginalResume
                  ? 'Download the exact file you last uploaded'
                  : 'Download original file (re-upload + Save if missing)'
              }
            >
              {downloading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Download className="h-3.5 w-3.5" />
              )}
              Download
            </button>
          </div>
        )}

        <details className="text-xs">
          <summary className="cursor-pointer text-on-surface-variant hover:text-on-surface font-medium">
            Or paste resume text
          </summary>
          <textarea
            className="input mt-2 min-h-[200px] font-mono text-xs"
            value={resumeText}
            onChange={(e) => setResumeText(e.target.value)}
            placeholder="Paste your full resume here..."
          />
          <div className="flex items-center justify-between mt-1">
            <p className="text-xs text-on-surface-variant">{resumeText.length} chars</p>
            {resumeText.length >= 200 && (
              <button
                type="button"
                onClick={reanalyze}
                disabled={analyzing}
                className="btn"
              >
                {analyzing ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Wand2 className="h-3 w-3" />
                )}
                Analyze pasted text
              </button>
            )}
          </div>
        </details>
      </section>

      <section className="card space-y-3">
        <h2 className="font-semibold text-on-surface">About you</h2>
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Email" ai={aiFields.has('email')}>
            <input
              className="input"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                clearAiFlag('email');
              }}
              type="email"
              placeholder="you@example.com"
              required
            />
          </Field>
          <Field label="Full name" ai={aiFields.has('fullName')}>
            <input
              className="input"
              value={fullName}
              onChange={(e) => {
                setFullName(e.target.value);
                clearAiFlag('fullName');
              }}
              placeholder="Your full name"
            />
          </Field>
        </div>
      </section>

      <section className="card space-y-3">
        <h2 className="font-semibold text-on-surface">Job preferences</h2>
        <div className="grid sm:grid-cols-2 gap-3">
          <Field
            label="Target roles"
            hint="Comma separated. Used by the LLM to focus matching."
            ai={aiFields.has('roles')}
          >
            <input
              className="input"
              value={roles}
              onChange={(e) => {
                setRoles(e.target.value);
                clearAiFlag('roles');
              }}
              placeholder="e.g. Senior Software Engineer, Product Manager"
            />
          </Field>
          <Field
            label="Preferred locations"
            hint="Comma separated. Used to personalise your LinkedIn job search — e.g. Bengaluru, Mumbai, Remote."
            ai={aiFields.has('locations')}
          >
            <input
              className="input"
              value={locations}
              onChange={(e) => {
                setLocations(e.target.value);
                clearAiFlag('locations');
              }}
              placeholder="e.g. Bengaluru, Mumbai, Remote"
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
          <Field label="Blacklisted companies" hint="Never show jobs from these companies.">
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
              className="w-full"
            />
          </Field>
          <label className="inline-flex items-center gap-2 text-sm text-on-surface">
            <input
              type="checkbox"
              checked={remoteOnly}
              onChange={(e) => setRemoteOnly(e.target.checked)}
            />
            Remote only
          </label>
        </div>
      </section>

      <div className="flex justify-end sticky bottom-20 z-20 md:bottom-4">
        <button
          onClick={() => void saveProfile({ source: 'manual' })}
          disabled={saving || analyzing}
          className="btn-primary shadow-card shadow-elevated ring-4 ring-background/80"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {saving ? 'Saving...' : 'Save profile'}
        </button>
      </div>

      <UnsavedProfileModal
        open={leaveModalOpen}
        onStay={() => {
          setLeaveModalOpen(false);
          pendingNavRef.current = null;
        }}
        onLeave={confirmLeave}
      />
    </div>
  );
}

function UnsavedProfileModal({
  open,
  onStay,
  onLeave,
}: {
  open: boolean;
  onStay: () => void;
  onLeave: () => void;
}) {
  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="unsaved-profile-title"
    >
      <div className="card max-w-md w-full space-y-4 shadow-elevated">
        <div className="flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <h2 id="unsaved-profile-title" className="font-semibold text-on-surface">
              Profile not saved
            </h2>
            <p className="text-sm text-on-surface-variant mt-1">
              You have changes that are not saved yet. If you leave now, job matches may not
              reflect your latest resume and preferences.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" className="btn" onClick={onStay}>
            Keep editing
          </button>
          <button type="button" className="btn btn-secondary" onClick={onLeave}>
            Leave without saving
          </button>
        </div>
      </div>
    </div>,
    document.body,
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
        <label className="text-xs text-on-surface-variant font-medium">{label}</label>
        {ai && (
          <span
            className="inline-flex items-center gap-0.5 text-[10px] text-primary font-medium"
            title="Auto-filled by AI from your resume. Edit to override."
          >
            <Sparkles className="h-2.5 w-2.5" /> AI
          </span>
        )}
      </div>
      <div className="mt-1">{children}</div>
      {hint && <p className="text-xs text-on-surface-variant mt-1">{hint}</p>}
    </div>
  );
}

function InsightsPanel({
  insights,
  onInsightsChange,
  onReanalyze,
  analyzing,
  insightsPatching,
}: {
  insights: ResumeInsights;
  onInsightsChange: (patch: Partial<ResumeInsights>) => void;
  onReanalyze: () => void;
  analyzing: boolean;
  insightsPatching: boolean;
}) {
  const seniorityValue = normalizeProfileSeniority(insights.seniority);

  return (
    <section className="card border-primary/30 bg-primary/5 space-y-3 animate-fade-in">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="font-semibold flex items-center gap-2 text-primary">
          <Sparkles className="h-4 w-4" /> Resume insights
        </h2>
        <div className="flex items-center gap-2">
          {insightsPatching && (
            <span className="text-xs text-on-surface-variant inline-flex items-center gap-1">
              <Loader2 className="h-3 w-3 animate-spin" /> Saving…
            </span>
          )}
          <button onClick={onReanalyze} disabled={analyzing} className="btn">
            {analyzing ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Wand2 className="h-3 w-3" />
            )}
            Re-analyze
          </button>
        </div>
      </div>
      {insights.summary && <p className="text-sm text-on-surface">{insights.summary}</p>}
      <div className="grid sm:grid-cols-3 gap-3 text-sm">
        <div className="rounded-xl border border-outline-variant bg-surface-container-low px-3 py-2 space-y-1">
          <label className="text-xs text-on-surface-variant" htmlFor="profile-years-exp">
            Years of experience
          </label>
          <input
            id="profile-years-exp"
            type="number"
            min={0}
            max={50}
            step={0.1}
            className="input text-sm py-1.5"
            value={insights.years_experience ?? ''}
            onChange={(e) =>
              onInsightsChange({
                years_experience: e.target.value === '' ? undefined : Number(e.target.value),
              })
            }
            placeholder="e.g. 7.5"
          />
          <p className="text-[10px] text-on-surface-variant">Saves automatically</p>
        </div>
        <div className="rounded-xl border border-outline-variant bg-surface-container-low px-3 py-2 space-y-1">
          <label className="text-xs text-on-surface-variant" htmlFor="profile-seniority">
            Seniority level
          </label>
          <PremiumSelect
            id="profile-seniority"
            value={seniorityValue}
            onChange={(v) => onInsightsChange({ seniority: v as ResumeInsights['seniority'] })}
            options={[...PROFILE_SENIORITY_OPTIONS]}
            compact
            aria-label="Seniority level"
          />
          <p className="text-[10px] text-on-surface-variant">Saves automatically</p>
        </div>
        {insights.current_location && (
          <KV label="Location" value={insights.current_location} />
        )}
      </div>
      {insights.top_skills && insights.top_skills.length > 0 && (
        <div>
          <div className="text-xs text-on-surface-variant mb-1 font-medium">Skills detected</div>
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
          <div className="text-xs text-on-surface-variant mb-1 font-medium">
            Suggested target roles
          </div>
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

function KV({ label, value, capitalize }: { label: string; value: string; capitalize?: boolean }) {
  return (
    <div className="rounded-xl border border-outline-variant bg-surface-container-low px-3 py-2">
      <div className="text-xs text-on-surface-variant">{label}</div>
      <div className={`font-medium text-on-surface ${capitalize ? 'capitalize' : ''}`}>{value}</div>
    </div>
  );
}

function csvToList(s: string): string[] {
  return s
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}
