import { Metadata } from 'next';
import Link from 'next/link';
import { MapPin, Clock, ArrowRight, Briefcase, TrendingUp, Search } from 'lucide-react';
import { CompanyLogo } from '../(app)/_components/CompanyLogo';
import { companyFromTitle } from '@/lib/company-logo';
import { supabaseAdmin } from '@/lib/supabase/server';
import { SOURCE_LABELS } from '@/lib/ui';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Explore Remote Jobs | Hyred - AI-Powered Job Search',
  description:
    'Browse thousands of curated remote jobs across India and worldwide. AI-scored matches for performance engineers, developers, and tech professionals.',
  keywords: [
    'remote jobs India',
    'AI job search',
    'performance engineer jobs',
    'developer jobs remote',
    'tech jobs India',
    'job matching AI',
    'ATS resume checker',
  ],
  openGraph: {
    title: 'Explore Remote Jobs | Hyred',
    description:
      'Browse thousands of AI-curated remote jobs. Free ATS resume scoring and tailored cover letters.',
    url: 'https://hyred.in/explore',
    siteName: 'Hyred',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Explore Remote Jobs | Hyred',
    description:
      'Browse thousands of AI-curated remote jobs. Free ATS resume scoring.',
  },
  alternates: {
    canonical: 'https://hyred.in/explore',
  },
};

type JobRow = {
  id: string;
  title: string;
  company: string | null;
  location: string | null;
  remote: boolean;
  source: string;
  salary: string | null;
  posted_at: string | null;
  tags: string[] | null;
};

function cleanExploreTitle(raw: string): string {
  let t = raw.trim();
  // Split on pipes and find the segment most likely to be a job title
  const parts = t.split('|').map(s => s.trim()).filter(Boolean);
  if (parts.length > 1) {
    // Heuristic: prefer segments with role keywords (engineer, developer, etc.)
    const roleRe = /\b(engineer|developer|tester|analyst|architect|designer|manager|lead|specialist|scientist|consultant|director|head|chief|sdet|sre|administrator|coordinator|technician)\b/i;
    const withRole = parts.filter(p => roleRe.test(p));
    if (withRole.length >= 1) t = withRole[0];
    else t = parts[0];
  }
  // Strip URLs
  t = t.replace(/https?:\/\/[^\s]+/gi, '').trim();
  t = t.replace(/www\.[^\s]+/gi, '').trim();
  // Strip hiring/recruitment tail keywords
  t = t.replace(/\s*\b(we['']?re hiring|hiring|openings?|open position|job|opportunity|is hiring|looking for|need(?:ed)?|wanted|join us|apply now|remote|full.?time|part.?time|contract|permanent|onsite|hybrid)\b.*$/i, '').trim();
  // Strip " - company" suffix only — avoid stripping commas (some real titles use them like "Software Engineer, Infrastructure")
  t = t.replace(/\s+-\s+.*$/, '').trim();
  // Strip parenthetical location/department noise
  t = t.replace(/\s*\([^)]*\b(?:location|office|department|team|division|pune|bangalore|mumbai|gurgaon|noida|hyderabad|chennai|delhi|usa|uk|india|remote|wfh|hybrid)\b[^)]*\)/gi, ' ').trim();
  // Clean up double spaces
  t = t.replace(/\s{2,}/g, ' ').trim();
  // Fallback if we stripped too much
  if (t.length < 3) return raw.trim();
  if (t.length > 80) t = t.slice(0, 77) + '...';
  return t;
}

function relativeTime(dateStr: string | null): string {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

export default async function ExplorePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; source?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const query = sp.q?.trim() || '';
  const source = sp.source || '';
  const page = Math.max(1, parseInt(sp.page || '1', 10));
  const pageSize = 24;
  const offset = (page - 1) * pageSize;

  const sb = supabaseAdmin();

  let queryBuilder = sb
    .from('jobs')
    .select('id, title, company, location, remote, source, salary, posted_at, tags', { count: 'exact' })
    .order('posted_at', { ascending: false })
    .range(offset, offset + pageSize - 1);

  if (query) {
    queryBuilder = queryBuilder.or(
      `title.ilike.%${query}%,company.ilike.%${query}%,description.ilike.%${query}%`,
    );
  }
  if (source) {
    queryBuilder = queryBuilder.eq('source', source);
  }

  const { data: jobs, count } = await queryBuilder;
  const totalPages = Math.ceil((count ?? 0) / pageSize);

  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: 'Explore Remote Jobs',
    description:
      'Browse AI-curated remote jobs for tech professionals in India and worldwide.',
    url: 'https://hyred.in/explore',
    publisher: {
      '@type': 'Organization',
      name: 'Hyred',
      url: 'https://hyred.in',
    },
  };

  return (
    <div className="min-h-screen bg-[#f9f9ff]">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />

      {/* Hero */}
      <header className="bg-gradient-to-br from-[#006a65] to-[#2cc9c0] text-white">
        <div className="max-w-6xl mx-auto px-4 py-16 sm:py-20 text-center">
          <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight mb-4">
            Find Your Next <span className="text-yellow-200">Remote Job</span>
          </h1>
          <p className="text-lg sm:text-xl text-white/80 max-w-2xl mx-auto mb-8">
            AI-curated job matches from top sources. Free ATS resume scoring and
            tailored cover letters.
          </p>
          <form action="/explore" method="GET" className="max-w-xl mx-auto">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  name="q"
                  defaultValue={query}
                  placeholder="Search jobs, companies, skills..."
                  className="w-full pl-10 pr-4 py-3 rounded-xl bg-white text-gray-900 shadow-lg focus:outline-none focus:ring-2 focus:ring-yellow-300"
                />
              </div>
              <button
                type="submit"
                className="px-6 py-3 bg-yellow-400 text-gray-900 font-semibold rounded-xl hover:bg-yellow-300 transition shadow-lg"
              >
                Search
              </button>
            </div>
          </form>
        </div>
      </header>

      {/* Stats bar */}
      <div className="bg-white border-b">
        <div className="max-w-6xl mx-auto px-4 py-4 flex flex-wrap gap-6 text-sm text-gray-600">
          <span className="flex items-center gap-1.5">
            <Briefcase className="w-4 h-4 text-[#006a65]" />
            <strong>{count ?? 0}</strong> jobs available
          </span>
          <span className="flex items-center gap-1.5">
            <TrendingUp className="w-4 h-4 text-[#006a65]" />
            Updated every 6 hours
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-green-500" />
            100% free to browse
          </span>
        </div>
      </div>

      {/* Source filters */}
      <div className="max-w-6xl mx-auto px-4 py-4 flex flex-wrap gap-2">
        <Link
          href="/explore"
          className={`px-3 py-1.5 rounded-full text-sm font-medium transition ${
            !source
              ? 'bg-[#006a65] text-white'
              : 'bg-white text-gray-600 border hover:bg-gray-50'
          }`}
        >
          All Sources
        </Link>
        {Object.entries(SOURCE_LABELS).map(([key, label]) => (
          <Link
            key={key}
            href={`/explore?source=${key}${query ? `&q=${query}` : ''}`}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition ${
              source === key
                ? 'bg-[#006a65] text-white'
                : 'bg-white text-gray-600 border hover:bg-gray-50'
            }`}
          >
            {label}
          </Link>
        ))}
      </div>

      {/* Job grid */}
      <main className="max-w-6xl mx-auto px-4 py-6">
        {(!jobs || jobs.length === 0) ? (
          <div className="text-center py-20 text-gray-500">
            <Search className="w-12 h-12 mx-auto mb-4 text-gray-300" />
            <p className="text-lg font-medium">No jobs found</p>
            <p className="text-sm mt-1">Try a different search or filter</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {jobs.map((job: JobRow) => {
              const displayTitle = cleanExploreTitle(job.title);
              const displayCompany = job.company || companyFromTitle(job.title);
              // Legacy board-style jobs have the company as the title — show the
              // logo inline with the h2 instead of a duplicate company row below.
              const titleIsCompany =
                displayCompany !== null &&
                displayTitle.toLowerCase() === displayCompany.toLowerCase();
              return (
                <Link
                  key={job.id}
                  href={`/explore/${job.id}`}
                  className="group bg-white rounded-xl border p-5 hover:shadow-md hover:border-[#006a65]/30 transition-all"
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <h2 className="flex items-center gap-1.5 font-semibold text-gray-900 group-hover:text-[#006a65] transition line-clamp-2">
                      {titleIsCompany && displayCompany && (
                        <CompanyLogo name={displayCompany} size={20} tileClassName="shrink-0" />
                      )}
                      <span className="truncate">{displayTitle}</span>
                    </h2>
                    <ArrowRight className="w-4 h-4 text-gray-300 group-hover:text-[#006a65] shrink-0 mt-1 transition" />
                  </div>
                  {displayCompany && !titleIsCompany && (
                    <p className="flex items-center gap-1.5 text-sm text-gray-600 mb-1">
                      <CompanyLogo name={displayCompany} size={20} />
                      <span className="truncate">{displayCompany}</span>
                    </p>
                  )}
                <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500 mb-3">
                  {job.location && (
                    <span className="flex items-center gap-1">
                      <MapPin className="w-3 h-3" />
                      {job.location}
                    </span>
                  )}
                  {job.remote && (
                    <span className="px-1.5 py-0.5 bg-green-50 text-green-700 rounded font-medium">
                      Remote
                    </span>
                  )}
                  {job.salary && (
                    <span className="text-green-600 font-medium">{job.salary}</span>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="px-2 py-0.5 bg-gray-100 rounded text-gray-500">
                    {SOURCE_LABELS[job.source as keyof typeof SOURCE_LABELS] ?? job.source}
                  </span>
                  {job.posted_at && (
                    <span className="flex items-center gap-1 text-gray-400">
                      <Clock className="w-3 h-3" />
                      {relativeTime(job.posted_at)}
                    </span>
                  )}
                </div>
                {job.tags && job.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {job.tags.slice(0, 4).map((tag: string) => (
                      <span
                        key={tag}
                        className="px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded text-[11px]"
                      >
                        {tag}
                      </span>
                    ))}
                    {job.tags.length > 4 && (
                      <span className="text-[11px] text-gray-400">
                        +{job.tags.length - 4}
                      </span>
                    )}
                  </div>
                )}
              </Link>
              );
            })}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex justify-center gap-2 mt-8">
            {page > 1 && (
              <Link
                href={`/explore?page=${page - 1}${query ? `&q=${query}` : ''}${source ? `&source=${source}` : ''}`}
                className="px-4 py-2 bg-white border rounded-lg text-sm hover:bg-gray-50"
              >
                Previous
              </Link>
            )}
            <span className="px-4 py-2 text-sm text-gray-500">
              Page {page} of {totalPages}
            </span>
            {page < totalPages && (
              <Link
                href={`/explore?page=${page + 1}${query ? `&q=${query}` : ''}${source ? `&source=${source}` : ''}`}
                className="px-4 py-2 bg-white border rounded-lg text-sm hover:bg-gray-50"
              >
                Next
              </Link>
            )}
          </div>
        )}
      </main>

      {/* CTA footer */}
      <section className="bg-gradient-to-br from-[#006a65] to-[#2cc9c0] text-white mt-12">
        <div className="max-w-4xl mx-auto px-4 py-12 text-center">
          <h2 className="text-2xl font-bold mb-3">Get AI-Matched Jobs Delivered to You</h2>
          <p className="text-white/80 mb-6">
            Sign up for free. Upload your resume and let our AI score every job against your skills.
          </p>
          <Link
            href="/login"
            className="inline-block px-8 py-3 bg-yellow-400 text-gray-900 font-semibold rounded-xl hover:bg-yellow-300 transition shadow-lg"
          >
            Get Started Free
          </Link>
        </div>
      </section>
    </div>
  );
}
