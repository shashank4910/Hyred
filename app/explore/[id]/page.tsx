import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import {
  MapPin,
  Building2,
  Clock,
  ArrowLeft,
  ExternalLink,
  Briefcase,
} from 'lucide-react';
import { supabaseAdmin } from '@/lib/supabase/server';
import { ensureFullDescription } from '@/lib/jd-fetcher';
import { SOURCE_LABELS } from '@/lib/ui';

export const dynamic = 'force-dynamic';

type JobRow = {
  id: string;
  title: string;
  company: string | null;
  location: string | null;
  remote: boolean;
  url: string;
  source: string;
  salary: string | null;
  description: string | null;
  posted_at: string | null;
  fetched_at: string;
  tags: string[] | null;
};

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

function stripHtml(html: string | null): string {
  if (!html) return '';
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const sb = supabaseAdmin();
  const { data: job } = await sb
    .from('jobs')
    .select('title, company, location, description, posted_at, salary')
    .eq('id', id)
    .maybeSingle();

  if (!job) return { title: 'Job Not Found | Hyred' };

  const desc = stripHtml(job.description).slice(0, 160);
  const title = `${job.title}${job.company ? ` at ${job.company}` : ''} | Hyred`;

  return {
    title,
    description: desc || `Apply for ${job.title} on Hyred. AI-scored job match.`,
    openGraph: {
      title,
      description: desc,
      url: `https://hyred.in/explore/${id}`,
      siteName: 'Hyred',
      type: 'article',
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description: desc,
    },
    alternates: {
      canonical: `https://hyred.in/explore/${id}`,
    },
  };
}

export default async function PublicJobPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const sb = supabaseAdmin();

  const { data: rawJob } = await sb
    .from('jobs')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (!rawJob) notFound();

  const job = rawJob as unknown as JobRow;

  const fullDescription = await ensureFullDescription({
    jobId: job.id,
    currentDescription: job.description,
    url: job.url,
  });

  const description = stripHtml(fullDescription || job.description);
  const posted = relativeTime(job.posted_at);

  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'JobPosting',
    title: job.title,
    description: description.slice(0, 5000),
    datePosted: job.posted_at || undefined,
    employmentType: 'FULL_TIME',
    hiringOrganization: job.company
      ? { '@type': 'Organization', name: job.company }
      : undefined,
    jobLocation: job.location
      ? {
          '@type': 'Place',
          address: {
            '@type': 'PostalAddress',
            addressLocality: job.location,
          },
        }
      : undefined,
    offers: job.salary
      ? { '@type': 'Offer', price: job.salary, priceCurrency: 'INR' }
      : undefined,
    url: job.url,
  };

  return (
    <div className="min-h-screen bg-[#f9f9ff]">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />

      {/* Header */}
      <header className="bg-white border-b sticky top-0 z-30">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-4">
          <Link
            href="/explore"
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-[#006a65] transition"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Jobs
          </Link>
          <div className="ml-auto flex items-center gap-3">
            <Link
              href="/free-tools/ats-score-checker"
              className="text-sm text-[#006a65] hover:underline font-medium"
            >
              Check Your Resume
            </Link>
            <Link
              href="/login"
              className="px-4 py-2 bg-[#006a65] text-white text-sm font-medium rounded-lg hover:bg-[#005855] transition"
            >
              Sign Up Free
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        {/* Job header card */}
        <div className="bg-white rounded-xl border p-6 sm:p-8 mb-6">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-3">
            {job.title}
          </h1>
          <div className="flex flex-wrap items-center gap-4 text-sm text-gray-600 mb-4">
            {job.company && (
              <span className="flex items-center gap-1.5">
                <Building2 className="w-4 h-4" />
                {job.company}
              </span>
            )}
            {job.location && (
              <span className="flex items-center gap-1.5">
                <MapPin className="w-4 h-4" />
                {job.location}
              </span>
            )}
            {job.remote && (
              <span className="px-2 py-0.5 bg-green-50 text-green-700 rounded text-xs font-medium">
                Remote
              </span>
            )}
            {job.salary && (
              <span className="text-green-600 font-semibold">{job.salary}</span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500">
            <span className="flex items-center gap-1 px-2 py-1 bg-gray-100 rounded">
              <Briefcase className="w-3 h-3" />
              {SOURCE_LABELS[job.source as keyof typeof SOURCE_LABELS] ?? job.source}
            </span>
            {posted && (
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                Posted {posted}
              </span>
            )}
            {job.url && (
              <a
                href={job.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-[#006a65] hover:underline"
              >
                <ExternalLink className="w-3 h-3" />
                Original Listing
              </a>
            )}
          </div>
          {job.tags && job.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-4">
              {job.tags.map((tag: string) => (
                <span
                  key={tag}
                  className="px-2 py-0.5 bg-blue-50 text-blue-600 rounded text-xs"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Job description */}
        <div className="bg-white rounded-xl border p-6 sm:p-8 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Job Description</h2>
          <div className="prose prose-sm max-w-none text-gray-700 whitespace-pre-wrap leading-relaxed">
            {description || 'No description available.'}
          </div>
        </div>

        {/* CTA */}
        <div className="bg-gradient-to-br from-[#006a65] to-[#2cc9c0] rounded-xl p-6 sm:p-8 text-center text-white">
          <h2 className="text-xl font-bold mb-2">Get AI-Matched to This Job</h2>
          <p className="text-white/80 mb-4 max-w-lg mx-auto">
            Upload your resume and our AI will score how well you match this and
            thousands of similar roles.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <Link
              href="/login"
              className="px-6 py-2.5 bg-yellow-400 text-gray-900 font-semibold rounded-lg hover:bg-yellow-300 transition"
            >
              Sign Up Free
            </Link>
            <Link
              href="/free-tools/ats-score-checker"
              className="px-6 py-2.5 bg-white/10 text-white font-medium rounded-lg hover:bg-white/20 transition"
            >
              Check ATS Score
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
