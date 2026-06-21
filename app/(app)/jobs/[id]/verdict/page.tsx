import { notFound } from 'next/navigation';
import { getCurrentProfile } from '@/lib/current-user';
import { getMatchSummary } from '../get-match-summary';
import { JobFeatureShell } from '../JobFeatureShell';
import { MatchIntelligencePanel } from '../MatchIntelligencePanel';

export const dynamic = 'force-dynamic';

export default async function MatchVerdictPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ return?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const profile = await getCurrentProfile();
  if (!profile) notFound();

  const match = await getMatchSummary(id, profile.id);
  if (!match) notFound();

  const backHref = sp.return ? decodeURIComponent(sp.return) : '/';
  const jobHref = sp.return
    ? `/jobs/${id}?return=${encodeURIComponent(sp.return)}`
    : `/jobs/${id}`;

  return (
    <JobFeatureShell
      match={match}
      featureLabel="Match Intelligence"
      backHref={backHref}
      jobHref={jobHref}
    >
      <MatchIntelligencePanel matchId={id} jobHref={jobHref} />
    </JobFeatureShell>
  );
}
