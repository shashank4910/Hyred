import { getCurrentProfile } from '@/lib/current-user';
import { OnboardingForm } from './OnboardingForm';
import type { ResumeInsights } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Profile' };

export default async function OnboardingPage() {
  const profile = await getCurrentProfile();

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-headline text-heading-sm font-bold text-on-background">Your profile</h1>
        <p className="text-body-md text-on-surface-variant mt-1">
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
