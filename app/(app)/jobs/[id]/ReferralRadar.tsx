'use client';

import { useEffect, useState } from 'react';
import {
  Users,
  Copy,
  Check,
  ExternalLink,
  Globe,
  UserSearch,
  MessageSquare,
  ChevronDown,
  ChevronUp,
  Briefcase,
  Send,
  Sparkles,
  Loader2,
} from 'lucide-react';
import { buildLinkedIn2ndUrl, buildLinkedInPeerUrl, buildLinkedInRecruiterUrl } from '@/lib/linkedin-people-search';
import { CompanyLogo } from '../../_components/CompanyLogo';

interface Props {
  matchId: string;
  company: string;
  jobTitle: string;
  matchScore: number | null;
  matchedSkills: string[];
  jobUrl: string;
}

type Template = 'peer' | 'recruiter' | 'warm';

const TEMPLATE_META: Record<Template, { label: string }> = {
  peer:      { label: 'Ask a peer' },
  recruiter: { label: 'Message recruiter' },
  warm:      { label: 'Ask for an intro' },
};

function buildMessage(
  type: Template,
  company: string,
  jobTitle: string,
  matchedSkills: string[],
): string {
  const skills = matchedSkills.slice(0, 3).join(', ');

  switch (type) {
    case 'peer':
      return `Hi [Name],

Hope you're doing well. I saw that you're at ${company} and noticed a ${jobTitle} role open there. I've been working with ${skills || 'similar tech/projects'} and think my background matches the role really well.

Would you be open to a quick chat about the team/culture, or perhaps a referral if you think it's a fit? Totally understand if you're too busy, but would love to connect.

Thanks,
[Your Name]`;

    case 'recruiter':
      return `Hi [Name],

I saw you're hiring for the ${jobTitle} role at ${company}. I wanted to reach out directly as I have a strong background in ${skills || 'this domain'}.

Are you open to a brief chat to see if my experience aligns with what the team is looking for? Happy to share my resume.

Best,
[Your Name]`;

    case 'warm':
      return `Hi [Name],

Hope you're having a good week. I came across a ${jobTitle} opening at ${company} and saw that you might be connected with someone there.

Would you be open to making a quick introduction? I'd love to ask them a couple of questions about the team and what they're looking for.

No pressure at all if you'd rather not. Appreciate it!

Best,
[Your Name]`;
  }
}

export function ReferralRadar({
  matchId,
  company,
  jobTitle,
  matchScore: _matchScore,
  matchedSkills,
  jobUrl: _jobUrl,
}: Props) {
  const [activeTemplate, setActiveTemplate] = useState<Template>('peer');
  const [copied, setCopied] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [reached, setReached] = useState(false);

  // AI customized messages state
  const [aiMessages, setAiMessages] = useState<Record<Template, string>>({
    peer: '',
    recruiter: '',
    warm: '',
  });
  const [generating, setGenerating] = useState<Record<Template, boolean>>({
    peer: false,
    recruiter: false,
    warm: false,
  });
  const [error, setError] = useState<string | null>(null);

  const staticMessage = buildMessage(activeTemplate, company, jobTitle, matchedSkills);
  const isAIGenerated = !!aiMessages[activeTemplate];
  const message = aiMessages[activeTemplate] || staticMessage;
  const isCurrentGenerating = generating[activeTemplate];

  async function generateAIOutreach(templateType: Template) {
    setGenerating((prev) => ({ ...prev, [templateType]: true }));
    setError(null);
    try {
      const res = await fetch(`/api/match/${matchId}/outreach`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ template: templateType }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to generate message');
      }
      const data = await res.json();
      setAiMessages((prev) => ({ ...prev, [templateType]: data.message }));
    } catch (e: any) {
      setError(e.message || 'Something went wrong');
    } finally {
      setGenerating((prev) => ({ ...prev, [templateType]: false }));
    }
  }

  async function copyText(text: string, key: string) {
    await navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  }


  useEffect(() => {
    const expand = () => setExpanded(true);
    window.addEventListener('hyred:expand-referral', expand);
    if (window.location.hash === '#referral') setExpanded(true);
    return () => window.removeEventListener('hyred:expand-referral', expand);
  }, []);

  return (
    <div
      id="referral"
      className="glass-card scroll-mt-24 overflow-hidden border border-outline-variant/30"
    >
      {/* Header */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between p-5 text-left hover:bg-surface-container-low/40 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10">
            <Users className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="font-headline font-semibold text-on-background text-base">
              Find an insider
            </h2>
            <p className="text-xs text-on-surface-variant mt-0.5">
              Get referred by someone who already works at{' '}
              <span className="inline-flex items-center gap-1 align-middle">
                <CompanyLogo name={company} size={12} />
                <span className="font-medium text-on-surface">{company}</span>
              </span>
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {reached && (
            <span className="inline-flex items-center gap-1 rounded-full bg-match-success/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-match-success">
              <Check className="h-3 w-3" /> Contacted
            </span>
          )}
          {expanded ? (
            <ChevronUp className="h-4 w-4 text-on-surface-variant" />
          ) : (
            <ChevronDown className="h-4 w-4 text-on-surface-variant" />
          )}
        </div>
      </button>

      {expanded && (
        <div className="border-t border-outline-variant/20 p-5 space-y-5">

          {/* Step 1 — Find people */}
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-on-surface-variant mb-3">
              Who to reach out to
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <a
                href={buildLinkedInPeerUrl(company)}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex flex-col gap-1.5 rounded-xl border border-outline-variant/40 bg-surface-container-low/60 p-3.5 hover:border-primary/40 hover:bg-primary/5 transition-all"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <UserSearch className="h-4 w-4 text-primary" />
                    <span className="text-xs font-semibold text-on-surface">1st connections</span>
                  </div>
                  <ExternalLink className="h-3 w-3 text-on-surface-variant group-hover:text-primary transition-colors" />
                </div>
                <p className="text-[11px] text-on-surface-variant leading-snug">
                  Your direct connections at {company}
                </p>
                <span className="self-start mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-primary group-hover:underline">
                  Find on LinkedIn &rarr;
                </span>
              </a>

              <a
                href={buildLinkedIn2ndUrl(company)}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex flex-col gap-1.5 rounded-xl border border-outline-variant/40 bg-surface-container-low/60 p-3.5 hover:border-secondary/40 hover:bg-secondary/5 transition-all"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4 text-secondary" />
                    <span className="text-xs font-semibold text-on-surface">2nd connections</span>
                  </div>
                  <ExternalLink className="h-3 w-3 text-on-surface-variant group-hover:text-secondary transition-colors" />
                </div>
                <p className="text-[11px] text-on-surface-variant leading-snug">
                  Mutual connections (ask for an intro)
                </p>
                <span className="self-start mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-secondary group-hover:underline">
                  Find on LinkedIn &rarr;
                </span>
              </a>

              <a
                href={buildLinkedInRecruiterUrl(company)}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex flex-col gap-1.5 rounded-xl border border-outline-variant/40 bg-surface-container-low/60 p-3.5 hover:border-tertiary/40 hover:bg-tertiary/5 transition-all"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Briefcase className="h-4 w-4 text-tertiary" />
                    <span className="text-xs font-semibold text-on-surface">Recruiting team</span>
                  </div>
                  <ExternalLink className="h-3 w-3 text-on-surface-variant group-hover:text-tertiary transition-colors" />
                </div>
                <p className="text-[11px] text-on-surface-variant leading-snug">
                  Go direct to the talent acquisition team
                </p>
                <span className="self-start mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-tertiary group-hover:underline">
                  Find on LinkedIn &rarr;
                </span>
              </a>
            </div>
          </div>

          {/* Step 2 — Message templates */}
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-on-surface-variant mb-3">
              Try one of these messages
            </p>

            {/* Template tabs */}
            <div className="flex flex-wrap gap-2 mb-3">
              {(Object.keys(TEMPLATE_META) as Template[]).map((t) => {
                const meta = TEMPLATE_META[t];
                const isActive = activeTemplate === t;
                return (
                  <button
                    key={t}
                    onClick={() => setActiveTemplate(t)}
                    className={[
                      'flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-all border',
                      isActive
                        ? 'bg-primary text-on-primary border-primary shadow-sm'
                        : 'bg-surface-container-low border-outline-variant/40 text-on-surface-variant hover:border-primary/40 hover:text-primary',
                    ].join(' ')}
                  >
                    {meta.label}
                  </button>
                );
              })}
            </div>

            {/* AI Personalization Alert/Action Banner */}
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/20 bg-primary/5 p-3.5">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary animate-pulse" />
                <div className="text-[11px] leading-snug font-medium text-on-surface-variant">
                  {isAIGenerated ? (
                    <span>
                      <strong className="text-primary">Tailored with AI!</strong> Draft matched to your resume accomplishments.
                    </span>
                  ) : (
                    <span>
                      Personalize this draft with your specific resume experience.
                    </span>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={() => generateAIOutreach(activeTemplate)}
                disabled={isCurrentGenerating}
                className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-[11px] font-bold text-on-primary hover:bg-primary/95 transition-all shadow-sm disabled:opacity-50"
              >
                {isCurrentGenerating ? (
                  <>
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Generating...
                  </>
                ) : isAIGenerated ? (
                  'Regenerate'
                ) : (
                  'Personalize with AI'
                )}
              </button>
            </div>

            {error && (
              <p className="text-[11px] text-red-500 mb-3 bg-red-50 p-2 rounded-lg border border-red-200">
                {error}
              </p>
            )}

            {/* Message box */}
            <div className="relative rounded-xl border border-outline-variant/40 bg-surface-container/50 min-h-[120px] overflow-hidden">
              {isCurrentGenerating ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-surface-container/30 backdrop-blur-[1px] gap-2">
                  <Loader2 className="h-5 w-5 animate-spin text-primary" />
                  <span className="text-[11px] font-medium text-on-surface-variant animate-pulse">Drafting message using your profile achievements...</span>
                </div>
              ) : null}
              <pre className={`whitespace-pre-wrap p-4 pr-16 text-xs leading-relaxed text-on-surface-variant font-sans transition-opacity duration-200 ${isCurrentGenerating ? 'opacity-20' : 'opacity-100'}`}>
                {message}
              </pre>
              <div className="absolute right-2 top-2 flex flex-col gap-1.5">
                <button
                  onClick={() => copyText(message, 'msg')}
                  title="Copy message"
                  className={[
                    'flex h-8 w-8 items-center justify-center rounded-lg border transition-all',
                    copied === 'msg'
                      ? 'border-match-success bg-match-success/10 text-match-success'
                      : 'border-outline-variant/40 bg-surface-container hover:border-primary/40 hover:text-primary text-on-surface-variant',
                  ].join(' ')}
                >
                  {copied === 'msg' ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                </button>
              </div>
            </div>

            {/* Send via buttons */}
            <div className="mt-2.5 flex flex-wrap gap-2">
              <a
                href={`https://www.linkedin.com/messaging/compose/?body=${encodeURIComponent(message)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg border border-outline-variant/40 bg-surface-container-low px-3 py-1.5 text-[11px] font-semibold text-on-surface-variant hover:border-[#0077B5]/40 hover:text-[#0077B5] transition-all"
              >
                <Globe className="h-3.5 w-3.5" />
                Open LinkedIn DM
              </a>
              <button
                onClick={() => copyText(message, 'wa')}
                className="inline-flex items-center gap-1.5 rounded-lg border border-outline-variant/40 bg-surface-container-low px-3 py-1.5 text-[11px] font-semibold text-on-surface-variant hover:border-green-500/40 hover:text-green-600 transition-all"
              >
                {copied === 'wa' ? <Check className="h-3.5 w-3.5" /> : <MessageSquare className="h-3.5 w-3.5" />}
                {copied === 'wa' ? 'Copied!' : 'Copy for WhatsApp'}
              </button>
              <button
                onClick={() => copyText(message, 'email')}
                className="inline-flex items-center gap-1.5 rounded-lg border border-outline-variant/40 bg-surface-container-low px-3 py-1.5 text-[11px] font-semibold text-on-surface-variant hover:border-primary/40 hover:text-primary transition-all"
              >
                {copied === 'email' ? <Check className="h-3.5 w-3.5" /> : <Send className="h-3.5 w-3.5" />}
                {copied === 'email' ? 'Copied!' : 'Copy for Email'}
              </button>
            </div>
          </div>

          {/* Track */}
          <div className="flex items-center justify-between rounded-xl border border-outline-variant/30 bg-surface-container/40 px-4 py-3">
            <div className="flex items-center gap-2.5">
              <div
                className={[
                  'flex h-8 w-8 items-center justify-center rounded-lg border-2 transition-all cursor-pointer',
                  reached
                    ? 'border-match-success bg-match-success/10'
                    : 'border-outline-variant/60 hover:border-primary',
                ].join(' ')}
                onClick={() => setReached((v) => !v)}
                role="checkbox"
                aria-checked={reached}
                aria-label="Mark as reached out"
              >
                {reached && <Check className="h-4 w-4 text-match-success" />}
              </div>
              <div>
                <p className="text-xs font-semibold text-on-surface">
                  {reached ? 'Message sent' : 'Sent a message?'}
                </p>
                <p className="text-[11px] text-on-surface-variant">
                  {reached
                    ? 'Outreach tracked. Let\'s wait for their response.'
                    : 'Check this to track who you have contacted.'}
                </p>
              </div>
            </div>
          </div>

          {/* Pro tip */}
          <div className="flex items-start gap-2.5 rounded-xl bg-primary/5 border border-primary/10 px-3.5 py-3">
            <p className="text-[11px] text-on-surface-variant leading-relaxed">
              <span className="font-semibold text-primary">Why this matters:</span> Referrals make a huge difference. Most people just apply online and get lost in the stack. Reaching out directly takes a couple of minutes but significantly increases your chance of getting a response.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
