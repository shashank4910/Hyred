import { supabaseAdmin } from '@/lib/supabase/server';
import { OnboardingForm } from './OnboardingForm';
import type { ResumeInsights } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Profile · JobRadar' };

export default async function OnboardingPage() {
  const sb = supabaseAdmin();
  const { data: profile } = await sb
    .from('profiles')
    .select('id, email, full_name, resume_text, preferences, insights')
    .order('created_at')
    .limit(1)
    .maybeSingle();

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Your profile</h1>
        <p className="text-sm text-muted">
          Upload your resume — we&apos;ll embed it once and use it to score every
          job. Update any time and we re-index automatically.
        </p>
      </div>
      <OnboardingForm
        initial={{
          email: profile?.email ?? '',
          fullName: profile?.full_name ?? '',
          resumeText: profile?.resume_text ?? '',
          preferences: profile?.preferences ?? {},
          insights: (profile?.insights as ResumeInsights | null) ?? null,
          resumeChars: (profile?.resume_text ?? '').length,
        }}
      />
    </div>
  );
}
