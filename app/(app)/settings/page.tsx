import Link from 'next/link';
import { FileText, Rocket, Sparkles } from 'lucide-react';
import { getCurrentProfile } from '@/lib/current-user';
import {
  getFeatureUsage,
  getPremiumAccess,
  quotaWindowKind,
} from '@/lib/premium';
import { formatResumeStudioMeter } from '@/lib/premium-upgrade';
import { PageHeader } from '../_components/PageHeader';
import { PremiumUpgradePanel } from '@/app/_components/PremiumUpgradePanel';

export const dynamic = 'force-dynamic';

type SearchParams = { upgrade?: string };

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const profile = await getCurrentProfile();
  if (!profile) return null;

  const access = await getPremiumAccess(profile.id);
  const resumeUsage = await getFeatureUsage(profile.id, 'resume_studio');
  const prepUsage = await getFeatureUsage(profile.id, 'interview_prep');
  const verdictUsage = await getFeatureUsage(profile.id, 'match_intelligence');
  const showUpgrade = sp.upgrade === 'resume_studio' || (resumeUsage.remaining ?? 0) === 0;
  const isPremium = access.plan !== 'free';
  const resumeWindow = quotaWindowKind(access.plan, 'resume_studio');

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Settings"
        description="Your plan, Resume Studio credits, and application profile."
      />
      <div className="space-y-6">

      {showUpgrade && !isPremium && (
        <PremiumUpgradePanel
          feature="resume_studio"
          headline="Upgrade when you’re ready"
          description="Stripe checkout is not live yet. When Premium launches, this page is where you’ll upgrade. Your free ATS score stays free."
        />
      )}

      <section className="rounded-[1.5rem] bg-surface-card p-6 shadow-card">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold text-on-surface flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              Hyred plan
            </h2>
            <p className="mt-1 text-sm text-on-surface-variant">
              {isPremium
                ? `You’re on ${access.plan.replace('_', ' ')}.`
                : 'Free plan — ATS scoring is unlimited; AI resume fixes use Resume Studio credits.'}
            </p>
          </div>
          <span
            className={`rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wider ${
              isPremium
                ? 'bg-primary/10 text-primary'
                : 'bg-surface-container text-on-surface-variant'
            }`}
          >
            {isPremium ? 'Premium' : 'Free'}
          </span>
        </div>

        <div className="mt-5 rounded-xl border border-outline-variant/40 bg-surface-container/40 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-on-surface">Resume Studio credits</p>
              <p className="mt-0.5 text-xs text-on-surface-variant">
                Shared by Fix Studio (ATS checker) and job-detail tailored resumes.
                {resumeWindow === 'lifetime' && !isPremium
                  ? ' Free allotment is 3 lifetime credits until billing cycles ship.'
                  : ' Resets each billing cycle on Premium.'}
              </p>
            </div>
            <p className="text-sm font-bold tabular-nums text-primary">
              {formatResumeStudioMeter(resumeUsage, access.plan)}
            </p>
          </div>
          {resumeUsage.limit != null && (
            <div
              className="mt-3 h-2 overflow-hidden rounded-full bg-surface-container"
              role="progressbar"
              aria-label="Resume Studio credits used"
              aria-valuemin={0}
              aria-valuemax={resumeUsage.limit}
              aria-valuenow={resumeUsage.used}
            >
              <div
                className="h-full rounded-full bg-primary transition-[width] duration-500"
                style={{
                  width: `${Math.min(100, (resumeUsage.used / resumeUsage.limit) * 100)}%`,
                }}
              />
            </div>
          )}
          <p className="mt-2 text-[11px] text-text-muted">
            Used {resumeUsage.used}
            {resumeUsage.limit != null ? ` / ${resumeUsage.limit}` : ''}
            {resumeUsage.remaining != null ? ` · ${resumeUsage.remaining} remaining` : ''}
          </p>
        </div>

        <dl className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-outline-variant/30 p-3">
            <dt className="text-xs font-semibold text-text-muted">Interview Prep</dt>
            <dd className="mt-1 text-sm font-semibold text-on-surface tabular-nums">
              {prepUsage.used}
              {prepUsage.limit != null ? ` / ${prepUsage.limit}` : ''} used
            </dd>
          </div>
          <div className="rounded-xl border border-outline-variant/30 p-3">
            <dt className="text-xs font-semibold text-text-muted">Match Intelligence</dt>
            <dd className="mt-1 text-sm font-semibold text-on-surface tabular-nums">
              {verdictUsage.limit === 0
                ? 'Premium only'
                : `${verdictUsage.used}${verdictUsage.limit != null ? ` / ${verdictUsage.limit}` : ''} used`}
            </dd>
          </div>
        </dl>
      </section>

      <section className="grid gap-3 sm:grid-cols-2">
        <Link
          href="/apply-profile"
          className="rounded-[1.5rem] bg-surface-card p-5 shadow-card transition-shadow hover:shadow-elevated"
        >
          <Rocket className="h-5 w-5 text-primary" />
          <h3 className="mt-3 font-semibold text-on-surface">Application profile</h3>
          <p className="mt-1 text-sm text-on-surface-variant">
            Screening answers and autofill memory for the extension.
          </p>
        </Link>
        <Link
          href="/onboarding"
          className="rounded-[1.5rem] bg-surface-card p-5 shadow-card transition-shadow hover:shadow-elevated"
        >
          <FileText className="h-5 w-5 text-primary" />
          <h3 className="mt-3 font-semibold text-on-surface">My resume</h3>
          <p className="mt-1 text-sm text-on-surface-variant">
            Upload or replace the master resume Hyred matches against.
          </p>
        </Link>
      </section>
      </div>
    </div>
  );
}
