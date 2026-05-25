import { supabaseAdmin } from '@/lib/supabase/server';
import { OnboardingForm } from './OnboardingForm';

export const dynamic = 'force-dynamic';

export default async function OnboardingPage() {
  const sb = supabaseAdmin();
  const { data: profile } = await sb
    .from('profiles')
    .select('id, email, full_name, resume_text, preferences')
    .order('created_at')
    .limit(1)
    .maybeSingle();

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Your profile</h1>
        <p className="text-sm text-muted">
          Paste your resume as text. It is embedded once and used to score jobs.
          Update it any time.
        </p>
      </div>
      <OnboardingForm
        initial={{
          email: profile?.email ?? '',
          fullName: profile?.full_name ?? '',
          resumeText: profile?.resume_text ?? '',
          preferences: profile?.preferences ?? {},
        }}
      />
    </div>
  );
}
