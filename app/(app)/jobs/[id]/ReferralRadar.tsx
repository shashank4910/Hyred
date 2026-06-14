'use client';

import { useState } from 'react';
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
} from 'lucide-react';

interface Props {
  company: string;
  jobTitle: string;
  matchScore: number | null;
  matchedSkills: string[];
  jobUrl: string;
}

type Template = 'peer' | 'recruiter' | 'warm';

const TEMPLATE_META: Record<Template, { label: string; emoji: string; badge: string }> = {
  peer:      { label: 'Ask a peer for referral',    emoji: '🤝', badge: 'Most effective' },
  recruiter: { label: 'Reach the internal recruiter', emoji: '📋', badge: 'Direct' },
  warm:      { label: 'Warm intro via mutual',       emoji: '👋', badge: 'High reply rate' },
};

function buildMessage(
  type: Template,
  company: string,
  jobTitle: string,
  matchScore: number | null,
  matchedSkills: string[],
): string {
  const skills = matchedSkills.slice(0, 3).join(', ');
  const score = matchScore != null ? `${matchScore}%` : 'strong';
  const skillLine = skills ? ` My top matching skills include ${skills}.` : '';

  switch (type) {
    case 'peer':
      return `Hi [Name],

I noticed you work at ${company} — I came across an opening for ${jobTitle} that looks like a great fit for my background (${score} match on Hyred's AI scorer).${skillLine}

Would you be open to a quick 10-min chat or, if you feel comfortable, a referral? Happy to share my resume.

Thanks so much!`;

    case 'recruiter':
      return `Hi [Name],

I'm reaching out about the ${jobTitle} position at ${company}. Based on my experience${skillLine ? ' (' + skills + ')' : ''}, I believe I'd be a strong fit — Hyred's AI match score puts me at ${score} for this role.

I'd love to connect and learn more about the opportunity. Is there a good time for a quick call?

Best,
[Your Name]`;

    case 'warm':
      return `Hi [Name],

Hope you're doing well! I came across a ${jobTitle} opening at ${company} and saw that you might be connected with someone there.

Would you be comfortable making an intro? My background in${skillLine ? ' ' + skills : ' this domain'} aligns really well with the role.

No worries if it's not the right fit — just thought I'd ask! Thanks 🙏`;
  }
}

function buildLinkedInPeerUrl(company: string): string {
  const q = encodeURIComponent(company);
  // F = 1st degree connections, company keyword search
  return `https://www.linkedin.com/search/results/people/?keywords=${q}&network=%5B%22F%22%5D`;
}

function buildLinkedInRecruiterUrl(company: string): string {
  const q = encodeURIComponent(`${company} recruiter OR "talent acquisition" OR HR`);
  return `https://www.linkedin.com/search/results/people/?keywords=${q}&network=%5B%22F%22%2C%22S%22%5D`;
}

function buildLinkedIn2ndUrl(company: string): string {
  const q = encodeURIComponent(company);
  return `https://www.linkedin.com/search/results/people/?keywords=${q}&network=%5B%22S%22%5D`;
}

export function ReferralRadar({
  company,
  jobTitle,
  matchScore,
  matchedSkills,
  jobUrl: _jobUrl,
}: Props) {
  const [activeTemplate, setActiveTemplate] = useState<Template>('peer');
  const [copied, setCopied] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(true);
  const [reached, setReached] = useState(false);

  const message = buildMessage(activeTemplate, company, jobTitle, matchScore, matchedSkills);

  async function copyText(text: string, key: string) {
    await navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  }

  return (
    <div className="glass-card overflow-hidden border border-outline-variant/30">
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
              Referral Radar
            </h2>
            <p className="text-xs text-on-surface-variant mt-0.5">
              Find someone at {company} who can open the door
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {reached && (
            <span className="inline-flex items-center gap-1 rounded-full bg-match-success/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-match-success">
              <Check className="h-3 w-3" /> Reached out
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
              Step 1 — Find the right people at {company}
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
                  Your direct LinkedIn connections at {company}
                </p>
                <span className="self-start mt-1 inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">
                  <Globe className="h-2.5 w-2.5" /> Search now
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
                  Friends of friends — ask for a warm intro
                </p>
                <span className="self-start mt-1 inline-flex items-center gap-1 rounded-full bg-secondary/10 px-2 py-0.5 text-[10px] font-bold text-secondary">
                  <Globe className="h-2.5 w-2.5" /> Search now
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
                    <span className="text-xs font-semibold text-on-surface">HR / Recruiter</span>
                  </div>
                  <ExternalLink className="h-3 w-3 text-on-surface-variant group-hover:text-tertiary transition-colors" />
                </div>
                <p className="text-[11px] text-on-surface-variant leading-snug">
                  Go direct — find the talent acquisition team
                </p>
                <span className="self-start mt-1 inline-flex items-center gap-1 rounded-full bg-tertiary/10 px-2 py-0.5 text-[10px] font-bold text-tertiary">
                  <Globe className="h-2.5 w-2.5" /> Search now
                </span>
              </a>
            </div>
          </div>

          {/* Step 2 — Message templates */}
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-on-surface-variant mb-3">
              Step 2 — Pick a message template &amp; copy
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
                    <span>{meta.emoji}</span>
                    {meta.label}
                    {isActive && (
                      <span className="ml-1 rounded-full bg-on-primary/20 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide">
                        {meta.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Message box */}
            <div className="relative rounded-xl border border-outline-variant/40 bg-surface-container/50">
              <pre className="whitespace-pre-wrap p-4 pr-16 text-xs leading-relaxed text-on-surface-variant font-sans">
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
                Open in LinkedIn DM
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

          {/* Step 3 — Track */}
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
                  {reached ? '✅ You reached out!' : 'Did you send a message?'}
                </p>
                <p className="text-[11px] text-on-surface-variant">
                  {reached
                    ? 'Great move — follow up in 5–7 days if no reply.'
                    : 'Check this off to track your outreach'}
                </p>
              </div>
            </div>
            {reached && (
              <span className="text-[10px] font-bold uppercase tracking-widest text-match-success animate-fade-in">
                Step 3 ✓
              </span>
            )}
          </div>

          {/* Pro tip */}
          <div className="flex items-start gap-2.5 rounded-xl bg-primary/5 border border-primary/10 px-3.5 py-3">
            <span className="text-base leading-none mt-0.5">💡</span>
            <p className="text-[11px] text-on-surface-variant leading-relaxed">
              <span className="font-semibold text-primary">Pro tip:</span> Referrals are{' '}
              <span className="font-semibold">4× more likely to get an interview</span> than cold
              applications. Even a 2nd-degree warm intro doubles your chances versus applying
              directly.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
