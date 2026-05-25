'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Preferences } from '@/lib/types';

type Initial = {
  email: string;
  fullName: string;
  resumeText: string;
  preferences: Preferences;
};

export function OnboardingForm({ initial }: { initial: Initial }) {
  const router = useRouter();
  const [email, setEmail] = useState(initial.email);
  const [fullName, setFullName] = useState(initial.fullName);
  const [resumeText, setResumeText] = useState(initial.resumeText);
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
  const [minScore, setMinScore] = useState(initial.preferences.min_score ?? 70);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch('/api/profile', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email,
          full_name: fullName,
          resume_text: resumeText,
          preferences: {
            roles: csvToList(roles),
            locations: csvToList(locations),
            remote_only: remoteOnly,
            exclude_keywords: csvToList(excludeKeywords),
            min_score: Number(minScore) || 70,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Save failed');
      setSuccess('Saved. Resume re-embedded.');
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="card space-y-3">
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
        <div>
          <label className="text-xs text-muted">Resume (plain text)</label>
          <textarea
            className="input mt-1 min-h-[260px] font-mono text-xs"
            value={resumeText}
            onChange={(e) => setResumeText(e.target.value)}
            placeholder="Paste your full resume here..."
          />
          <p className="text-xs text-muted mt-1">
            Tip: open your .docx, select all, copy, paste. {resumeText.length} chars.
          </p>
        </div>
      </div>

      <div className="card space-y-3">
        <h2 className="font-semibold">Preferences</h2>
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-muted">
              Target roles (comma separated)
            </label>
            <input
              className="input mt-1"
              value={roles}
              onChange={(e) => setRoles(e.target.value)}
              placeholder="Senior Performance Engineer, SRE, Performance Architect"
            />
          </div>
          <div>
            <label className="text-xs text-muted">
              Locations (comma separated)
            </label>
            <input
              className="input mt-1"
              value={locations}
              onChange={(e) => setLocations(e.target.value)}
              placeholder="India, Remote, Bangalore"
            />
          </div>
          <div>
            <label className="text-xs text-muted">
              Avoid keywords (comma separated)
            </label>
            <input
              className="input mt-1"
              value={excludeKeywords}
              onChange={(e) => setExcludeKeywords(e.target.value)}
              placeholder="Junior, Intern, Contract"
            />
          </div>
          <div>
            <label className="text-xs text-muted">
              Minimum score to keep ({minScore})
            </label>
            <input
              className="input mt-1"
              type="range"
              min={50}
              max={95}
              step={5}
              value={minScore}
              onChange={(e) => setMinScore(Number(e.target.value))}
            />
          </div>
        </div>
        <label className="inline-flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={remoteOnly}
            onChange={(e) => setRemoteOnly(e.target.checked)}
          />
          Remote only
        </label>
      </div>

      {error && (
        <div className="card border-red-500/40 text-red-300 text-sm">{error}</div>
      )}
      {success && (
        <div className="card border-primary/40 text-primary text-sm">{success}</div>
      )}

      <div className="flex justify-end">
        <button onClick={save} disabled={saving} className="btn-primary">
          {saving ? 'Saving...' : 'Save profile'}
        </button>
      </div>
    </div>
  );
}

function csvToList(s: string): string[] {
  return s
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
}
