import { Metadata } from 'next';
import Link from 'next/link';
import {
  CheckCircle2,
  FileText,
  Zap,
  Target,
  Shield,
  ArrowRight,
  Star,
  BarChart3,
  Upload,
} from 'lucide-react';
import { AtsCheckerWidget } from './AtsCheckerWidget';

export const metadata: Metadata = {
  title: 'Free ATS Resume Score Checker | Hyred - AI Resume Scanner',
  description:
    'Check your resume score against ATS systems instantly. Free AI-powered resume scanner analyzes formatting, keywords, and job-match compatibility. Get scored in seconds.',
  keywords: [
    'ATS score checker',
    'resume scanner free',
    'ATS resume checker',
    'resume score calculator',
    'job application checker',
    'resume keyword optimizer',
    'ATS friendly resume',
  ],
  openGraph: {
    title: 'Free ATS Resume Score Checker | Hyred',
    description:
      'Check your resume against ATS systems instantly. Free AI-powered scoring for formatting, keywords, and job-match compatibility.',
    url: 'https://hyred.in/free-tools/ats-score-checker',
    siteName: 'Hyred',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Free ATS Resume Score Checker | Hyred',
    description:
      'Check your resume against ATS systems instantly. Free AI-powered scoring.',
  },
  alternates: {
    canonical: 'https://hyred.in/free-tools/ats-score-checker',
  },
};

const FEATURES = [
  {
    icon: BarChart3,
    title: 'ATS Compatibility Score',
    desc: 'See how your resume scores against applicant tracking systems used by 98% of Fortune 500 companies.',
  },
  {
    icon: Target,
    title: 'Keyword Optimization',
    desc: 'Identify missing keywords and skills that ATS systems scan for in your target job descriptions.',
  },
  {
    icon: FileText,
    title: 'Format & Structure Analysis',
    desc: 'Get feedback on formatting issues, section structure, and readability that affect ATS parsing.',
  },
  {
    icon: Zap,
    title: 'Instant AI Analysis',
    desc: 'Powered by GPT-4o for deep semantic analysis of your resume content and job-match alignment.',
  },
];

const STEPS = [
  { num: '1', title: 'Upload Resume', desc: 'Drop your PDF or DOCX resume' },
  { num: '2', title: 'Paste Job Description', desc: 'Optionally add a JD for targeted scoring' },
  { num: '3', title: 'Get Your Score', desc: 'Receive instant ATS compatibility feedback' },
];

export default function AtsScoreCheckerLandingPage() {
  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: 'Free ATS Resume Score Checker',
    url: 'https://hyred.in/free-tools/ats-score-checker',
    description:
      'Check your resume score against ATS systems. Free AI-powered resume scanner.',
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web',
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'USD',
    },
  };

  return (
    <div className="min-h-screen bg-[#f9f9ff]">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />

      {/* Nav */}
      <nav className="bg-white border-b">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-8 h-8 bg-gradient-to-br from-[#006a65] to-[#2cc9c0] rounded-lg flex items-center justify-center text-white font-bold text-sm">
              H
            </div>
            <span className="font-bold text-gray-900">Hyred</span>
          </Link>
          <div className="flex items-center gap-3">
            <Link href="/explore" className="text-sm text-gray-600 hover:text-[#006a65]">
              Browse Jobs
            </Link>
            <Link
              href="/login"
              className="px-4 py-2 bg-[#006a65] text-white text-sm font-medium rounded-lg hover:bg-[#005855] transition"
            >
              Sign Up Free
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <header className="bg-gradient-to-br from-[#006a65] to-[#2cc9c0] text-white">
        <div className="max-w-4xl mx-auto px-4 py-16 sm:py-20 text-center">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-white/10 rounded-full text-sm mb-6">
            <Shield className="w-4 h-4 text-yellow-300" />
            100% Free - No Sign-up Required
          </div>
          <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight mb-4">
            Check Your <span className="text-yellow-200">ATS Resume Score</span>
          </h1>
          <p className="text-lg sm:text-xl text-white/80 max-w-2xl mx-auto mb-8">
            75% of resumes are rejected by ATS before a human sees them. Find out
            if yours makes the cut with our free AI-powered scanner.
          </p>
          <div className="flex flex-wrap justify-center gap-4 text-sm text-white/70">
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-yellow-300" />
              PDF & DOCX supported
            </span>
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-yellow-300" />
              Results in seconds
            </span>
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-yellow-300" />
              Powered by GPT-4o
            </span>
          </div>
        </div>
      </header>

      {/* Tool */}
      <section id="tool" className="max-w-4xl mx-auto px-4 -mt-8 relative z-10">
        <AtsCheckerWidget />
      </section>

      {/* How it works */}
      <section className="max-w-4xl mx-auto px-4 py-16">
        <h2 className="text-2xl font-bold text-center text-gray-900 mb-10">
          How It Works
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
          {STEPS.map((step) => (
            <div key={step.num} className="text-center">
              <div className="w-12 h-12 rounded-full bg-[#006a65] text-white font-bold text-lg flex items-center justify-center mx-auto mb-3">
                {step.num}
              </div>
              <h3 className="font-semibold text-gray-900 mb-1">{step.title}</h3>
              <p className="text-sm text-gray-500">{step.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section className="bg-white py-16">
        <div className="max-w-4xl mx-auto px-4">
          <h2 className="text-2xl font-bold text-center text-gray-900 mb-10">
            What We Analyze
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {FEATURES.map((f) => (
              <div
                key={f.title}
                className="flex gap-4 p-5 bg-[#f9f9ff] rounded-xl border"
              >
                <div className="w-10 h-10 bg-[#006a65]/10 rounded-lg flex items-center justify-center shrink-0">
                  <f.icon className="w-5 h-5 text-[#006a65]" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 mb-1">{f.title}</h3>
                  <p className="text-sm text-gray-500">{f.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Social proof */}
      <section className="py-16">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <div className="flex justify-center gap-1 mb-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <Star
                key={i}
                className="w-5 h-5 text-yellow-400 fill-yellow-400"
              />
            ))}
          </div>
          <p className="text-gray-600 italic max-w-lg mx-auto">
            &ldquo;Got my ATS score from 42 to 91. Landed 3 interviews within a week
            of optimizing my resume with Hyred.&rdquo;
          </p>
          <p className="text-sm text-gray-400 mt-2">
            - Software Engineer, Bangalore
          </p>
        </div>
      </section>

      {/* Full product CTA */}
      <section className="bg-gradient-to-br from-[#006a65] to-[#2cc9c0] text-white py-16">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <h2 className="text-2xl sm:text-3xl font-bold mb-3">
            Ready for AI-Powered Job Matching?
          </h2>
          <p className="text-white/80 max-w-lg mx-auto mb-6">
            Hyred goes beyond ATS scoring. Get personalized job matches, AI-tailored
            cover letters, and skill gap analysis — all for free.
          </p>
          <Link
            href="/login"
            className="inline-flex items-center gap-2 px-8 py-3 bg-yellow-400 text-gray-900 font-semibold rounded-xl hover:bg-yellow-300 transition shadow-lg"
          >
            Get Started Free
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-white border-t py-8">
        <div className="max-w-6xl mx-auto px-4 flex flex-wrap justify-center gap-6 text-sm text-gray-500">
          <Link href="/explore" className="hover:text-[#006a65]">
            Browse Jobs
          </Link>
          <Link href="/privacy" className="hover:text-[#006a65]">
            Privacy
          </Link>
          <Link href="/terms" className="hover:text-[#006a65]">
            Terms
          </Link>
          <Link href="/contact" className="hover:text-[#006a65]">
            Contact
          </Link>
        </div>
      </footer>
    </div>
  );
}
