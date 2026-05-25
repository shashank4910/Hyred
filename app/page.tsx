import Link from 'next/link';
import { supabaseAdmin } from '@/lib/supabase/server';
import { StatusFilter } from './_components/StatusFilter';
import { RunIngestButton } from './_components/RunIngestButton';

export const dynamic = 'force-dynamic';

type SearchParams = { status?: string };

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const status = sp.status ?? 'new';

  const sb = supabaseAdmin();

  // Find or warn about missing profile
  const { data: profile } = await sb
    .from('profiles')
    .select('id, email, full_name, resume_text')
    .order('created_at')
    .limit(1)
    .maybeSingle();

  if (!profile || !profile.resume_text) {
    return (
      <div className="card">
        <h1 className="text-xl font-semibold mb-2">Welcome to JobRadar</h1>
        <p className="text-muted mb-4">
          Add your resume so we can start finding matches.
        </p>
        <Link href="/onboarding" className="btn-primary">
          Add my resume
        </Link>
      </div>
    );
  }

  // Pull matches in current status, joined with the job
  const { data: matches } = await sb
    .from('matches')
    .select(
      `id, llm_score, similarity, reason, status, applied_at, created_at,
       job:jobs(id, title, company, location, remote, url, source, salary, posted_at)`,
    )
    .eq('profile_id', profile.id)
    .eq('status', status)
    .order('llm_score', { ascending: false })
    .limit(100);

  const counts = await getStatusCounts(sb, profile.id);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold">Your matches</h1>
          <p className="text-sm text-muted">
            Signed in as {profile.full_name ?? profile.email}
          </p>
        </div>
        <RunIngestButton />
      </div>

      <StatusFilter counts={counts} active={status} />

      {(matches ?? []).length === 0 ? (
        <div className="card text-muted">
          No matches in <span className="text-primary">{status}</span> yet. Try
          running ingest, or check another tab.
        </div>
      ) : (
        <ul className="space-y-3">
          {(matches ?? []).map((m) => {
            const job = m.job as unknown as {
              id: string;
              title: string;
              company: string | null;
              location: string | null;
              remote: boolean;
              url: string;
              source: string;
              salary: string | null;
              posted_at: string | null;
            };
            return (
              <li key={m.id} className="card hover:border-primary/40 transition-colors">
                <Link href={`/jobs/${m.id}`} className="block">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-lg font-semibold truncate">
                          {job.title}
                        </span>
                      </div>
                      <div className="text-sm text-muted truncate">
                        {[job.company, job.location || (job.remote ? 'Remote' : null)]
                          .filter(Boolean)
                          .join(' · ')}
                      </div>
                      {m.reason && (
                        <p className="mt-2 text-sm text-[#cbd5e1] line-clamp-2">
                          {m.reason}
                        </p>
                      )}
                      <div className="mt-2 flex flex-wrap gap-2">
                        <span className="badge">{job.source}</span>
                        {job.salary && <span className="badge">{job.salary}</span>}
                        {job.remote && <span className="badge">remote</span>}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-3xl font-bold text-primary">
                        {m.llm_score}
                      </div>
                      <div className="text-xs text-muted">match</div>
                    </div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

async function getStatusCounts(
  sb: ReturnType<typeof supabaseAdmin>,
  profileId: string,
): Promise<Record<string, number>> {
  const statuses = [
    'new',
    'saved',
    'applied',
    'interviewing',
    'offer',
    'rejected',
    'closed',
  ];
  const counts: Record<string, number> = {};
  await Promise.all(
    statuses.map(async (s) => {
      const { count } = await sb
        .from('matches')
        .select('id', { count: 'exact', head: true })
        .eq('profile_id', profileId)
        .eq('status', s);
      counts[s] = count ?? 0;
    }),
  );
  return counts;
}
