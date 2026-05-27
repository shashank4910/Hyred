'use client';

import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import {
  User, Phone, MapPin, Link2, Briefcase, IndianRupee,
  Clock, Globe, BookOpen, Save, Loader2, CheckCircle2,
} from 'lucide-react';

type Profile = Record<string, string | boolean | number | null>;

const WORK_TYPES = ['remote', 'hybrid', 'onsite'];
const TRAVEL_OPTIONS = ['minimal', '25%', '50%', 'frequent'];
const NOTICE_OPTIONS = ['Immediate', '15 days', '30 days', '45 days', '60 days', '90 days'];
const GENDER_OPTIONS = ['Male', 'Female', 'Non-binary', 'Prefer not to say'];
const VETERAN_OPTIONS = ['No', 'Yes', 'Prefer not to say'];
const DISABILITY_OPTIONS = ['No', 'Yes', 'Prefer not to say'];

export function ApplyProfileForm() {
  const [form, setForm] = useState<Profile>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch('/api/apply-profile')
      .then(r => r.json())
      .then(d => { setForm(d ?? {}); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  function set(key: string, value: string | boolean | number | null) {
    setForm(prev => ({ ...prev, [key]: value }));
    setSaved(false);
  }

  async function save() {
    setSaving(true);
    try {
      const res = await fetch('/api/apply-profile', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error('Save failed');
      toast.success('Application profile saved');
      setSaved(true);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const f = (key: string) => (form[key] as string) ?? '';
  const b = (key: string) => !!(form[key] as boolean);

  if (loading) return (
    <div className="space-y-3">
      {[...Array(6)].map((_, i) => <div key={i} className="skeleton h-10 w-full" />)}
    </div>
  );

  return (
    <div className="space-y-6">

      {/* ── Personal Info ─────────────────────────────────────── */}
      <Section icon={<User className="h-4 w-4" />} title="Personal Information">
        <Grid>
          <Field label="Full Name">
            <input className="input" value={f('full_name')} onChange={e => set('full_name', e.target.value)} placeholder="Shashank Singh" />
          </Field>
          <Field label="Email">
            <input className="input" type="email" value={f('email')} onChange={e => set('email', e.target.value)} placeholder="you@email.com" />
          </Field>
          <Field label="Phone (with country code)">
            <input className="input" value={f('phone')} onChange={e => set('phone', e.target.value)} placeholder="+91 9876543210" />
          </Field>
          <Field label="City">
            <input className="input" value={f('city')} onChange={e => set('city', e.target.value)} placeholder="Noida" />
          </Field>
          <Field label="State / Province">
            <input className="input" value={f('state_province')} onChange={e => set('state_province', e.target.value)} placeholder="Uttar Pradesh" />
          </Field>
          <Field label="Country">
            <input className="input" value={f('country') || 'India'} onChange={e => set('country', e.target.value)} placeholder="India" />
          </Field>
          <Field label="Zip / PIN Code">
            <input className="input" value={f('zip_code')} onChange={e => set('zip_code', e.target.value)} placeholder="201301" />
          </Field>
        </Grid>
      </Section>

      {/* ── Professional Links ────────────────────────────────── */}
      <Section icon={<Link2 className="h-4 w-4" />} title="Professional Links">
        <Grid>
          <Field label="LinkedIn URL">
            <input className="input" value={f('linkedin_url')} onChange={e => set('linkedin_url', e.target.value)} placeholder="https://linkedin.com/in/your-profile" />
          </Field>
          <Field label="GitHub URL">
            <input className="input" value={f('github_url')} onChange={e => set('github_url', e.target.value)} placeholder="https://github.com/yourusername" />
          </Field>
          <Field label="Portfolio / Website URL">
            <input className="input" value={f('portfolio_url')} onChange={e => set('portfolio_url', e.target.value)} placeholder="https://yourportfolio.com" />
          </Field>
        </Grid>
      </Section>

      {/* ── Experience & Compensation ────────────────────────── */}
      <Section icon={<Briefcase className="h-4 w-4" />} title="Experience & Compensation">
        <Grid>
          <Field label="Current Job Title">
            <input className="input" value={f('current_title')} onChange={e => set('current_title', e.target.value)} placeholder="Senior Performance Engineer" />
          </Field>
          <Field label="Total Years of Experience">
            <input className="input" type="number" min={0} max={50} value={f('years_experience')} onChange={e => set('years_experience', e.target.value)} placeholder="7" />
          </Field>
          <Field label="Current CTC (e.g. 18 LPA)">
            <input className="input" value={f('total_ctc')} onChange={e => set('total_ctc', e.target.value)} placeholder="18 LPA" />
          </Field>
          <Field label="Expected CTC (e.g. 24 LPA)">
            <input className="input" value={f('expected_ctc')} onChange={e => set('expected_ctc', e.target.value)} placeholder="24 LPA" />
          </Field>
        </Grid>
      </Section>

      {/* ── Availability ──────────────────────────────────────── */}
      <Section icon={<Clock className="h-4 w-4" />} title="Availability">
        <Grid>
          <Field label="Notice Period">
            <select className="input" value={f('notice_period') || '30 days'} onChange={e => set('notice_period', e.target.value)}>
              {NOTICE_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </Field>
          <Field label="Available From (if different from notice)">
            <input className="input" type="date" value={f('available_from')} onChange={e => set('available_from', e.target.value)} />
          </Field>
          <Field label="Preferred Work Type">
            <select className="input" value={f('preferred_work_type') || 'hybrid'} onChange={e => set('preferred_work_type', e.target.value)}>
              {WORK_TYPES.map(o => <option key={o} value={o} className="capitalize">{o.charAt(0).toUpperCase() + o.slice(1)}</option>)}
            </select>
          </Field>
          <Field label="Willing to Travel">
            <select className="input" value={f('willing_to_travel') || 'minimal'} onChange={e => set('willing_to_travel', e.target.value)}>
              {TRAVEL_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </Field>
          <Field label="Willing to Relocate?" span={2}>
            <div className="flex items-center gap-4 mt-1">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="radio" name="relocate" checked={b('willing_to_relocate')} onChange={() => set('willing_to_relocate', true)} /> Yes
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="radio" name="relocate" checked={!b('willing_to_relocate')} onChange={() => set('willing_to_relocate', false)} /> No
              </label>
            </div>
          </Field>
          {b('willing_to_relocate') && (
            <Field label="Preferred Relocation Cities" span={2}>
              <input className="input" value={f('relocation_cities')} onChange={e => set('relocation_cities', e.target.value)} placeholder="Bangalore, Hyderabad, Mumbai" />
            </Field>
          )}
        </Grid>
      </Section>

      {/* ── Work Authorization ────────────────────────────────── */}
      <Section icon={<Globe className="h-4 w-4" />} title="Work Authorization">
        <Grid>
          <Field label="Authorized to work in">
            <input className="input" value={f('work_auth_country') || 'India'} onChange={e => set('work_auth_country', e.target.value)} placeholder="India" />
          </Field>
          <Field label="Require Visa Sponsorship?">
            <div className="flex items-center gap-4 mt-1">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="radio" name="sponsor" checked={b('require_sponsorship')} onChange={() => set('require_sponsorship', true)} /> Yes
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="radio" name="sponsor" checked={!b('require_sponsorship')} onChange={() => set('require_sponsorship', false)} /> No
              </label>
            </div>
          </Field>
        </Grid>
      </Section>

      {/* ── Demographic (EEO) ─────────────────────────────────── */}
      <Section icon={<User className="h-4 w-4" />} title="Demographic Info (EEO — required on some forms)">
        <p className="text-xs text-stone mb-3">Many job platforms (Greenhouse, Lever, Workday) require these for compliance. Your answers are stored only for auto-fill purposes.</p>
        <Grid>
          <Field label="Gender">
            <select className="input" value={f('gender') || ''} onChange={e => set('gender', e.target.value)}>
              <option value="">Select...</option>
              {GENDER_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </Field>
          <Field label="Veteran Status">
            <select className="input" value={f('veteran_status') || 'No'} onChange={e => set('veteran_status', e.target.value)}>
              {VETERAN_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </Field>
          <Field label="Disability Status">
            <select className="input" value={f('disability_status') || 'No'} onChange={e => set('disability_status', e.target.value)}>
              {DISABILITY_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </Field>
        </Grid>
      </Section>

      {/* ── Standard Essay Answers ───────────────────────────── */}
      <Section icon={<BookOpen className="h-4 w-4" />} title="Standard Essay Answers">
        <p className="text-xs text-stone mb-3">The agent uses these as a base when filling text fields on application forms. Be specific — the AI will adapt them per company.</p>
        <div className="space-y-4">
          <Field label="Tell me about yourself (2-3 sentences)">
            <textarea className="input min-h-[80px]" value={f('answer_about_yourself')} onChange={e => set('answer_about_yourself', e.target.value)}
              placeholder="Senior Performance Engineer with 7.7 years building enterprise-scale load testing frameworks and AI automation agents across BFSI, Healthcare, and Media domains..." />
          </Field>
          <Field label="Why are you looking to leave your current role?">
            <textarea className="input min-h-[70px]" value={f('answer_why_leave')} onChange={e => set('answer_why_leave', e.target.value)}
              placeholder="I'm seeking a role that offers..." />
          </Field>
          <Field label="What are your key strengths?">
            <textarea className="input min-h-[70px]" value={f('answer_strengths')} onChange={e => set('answer_strengths', e.target.value)}
              placeholder="Deep expertise in performance engineering, ability to build AI-powered automation..." />
          </Field>
          <Field label="What is your biggest weakness?">
            <textarea className="input min-h-[60px]" value={f('answer_weaknesses')} onChange={e => set('answer_weaknesses', e.target.value)}
              placeholder="I sometimes over-invest in perfecting automation frameworks when a simpler solution would suffice..." />
          </Field>
          <Field label="Salary expectation (one-liner for forms)">
            <input className="input" value={f('answer_salary_expectation')} onChange={e => set('answer_salary_expectation', e.target.value)}
              placeholder="24–28 LPA, open to discussion based on overall package" />
          </Field>
        </div>
      </Section>

      {/* ── Save button ───────────────────────────────────────── */}
      <div className="flex items-center justify-between pt-2">
        {saved && (
          <span className="inline-flex items-center gap-1.5 text-sm text-emerald-600">
            <CheckCircle2 className="h-4 w-4" /> Saved — agent will use these answers
          </span>
        )}
        <button onClick={save} disabled={saving} className="btn-primary ml-auto">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {saving ? 'Saving...' : 'Save Profile'}
        </button>
      </div>
    </div>
  );
}

// ── Small layout helpers ────────────────────────────────────────────────────

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="card space-y-4">
      <h2 className="font-semibold text-ink flex items-center gap-2">
        <span className="text-amber">{icon}</span> {title}
      </h2>
      {children}
    </div>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">{children}</div>;
}

function Field({ label, children, span }: { label: string; children: React.ReactNode; span?: number }) {
  return (
    <div className={span === 2 ? 'sm:col-span-2' : ''}>
      <label className="block text-xs font-medium text-stone mb-1">{label}</label>
      {children}
    </div>
  );
}
