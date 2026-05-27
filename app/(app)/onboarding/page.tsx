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
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-heading-sm font-semibold text-ink">Your profile</h1>
        <p className="text-body-sm text-stone mt-1">
          Upload your resume — we&apos;ll embed it and use it to score every job.
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
