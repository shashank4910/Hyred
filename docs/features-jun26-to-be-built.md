# Features For Jun 26 To Be Built

> **Purpose:** This is the source-of-truth product and implementation handoff for Hyred Premium work starting June 2026.
>
> **Audience:** founders, product, current coding agent, future coding agents.
>
> **Goal:** any agent should be able to pick up this document, understand what is locked, what order to build in, what is out of scope, and where in the codebase each feature should land.

---

## 1. Executive Decision

These premium features are now locked for the June 2026 roadmap.

### Tier 1 — Build First
1. **Interview Prep Pack**
2. **Match Intelligence**
3. **Resume Studio Pro**

### Tier 2 — Build Next
4. **Smart Scan Plus**
5. **Autofill Pro**
6. **Dream Company Job Alerts** *(in progress — Jun 21, 2026)*

### Tier 3 — After Tier 1 and Tier 2
6. **Application Health Report**
7. **Recruiter Lens**

This is **not** a pivot. Hyred remains the same product:

- AI job-match dashboard
- per-job skill match
- ATS resume tailoring
- cover letter generation
- outreach generation
- apply-profile memory
- extension autofill

Premium adds stronger outcomes and stronger reasons to pay. It does **not** replace Hyred's core loop.

---

## 2. Premium Product Strategy

## Core premium promise

**Hyred Premium helps users choose better jobs, apply better, and interview better.**

That breaks down into three user outcomes:

1. **Choose better**
   - Match Intelligence
   - Smart Scan Plus
   - Application Health Report

2. **Apply better**
   - Resume Studio Pro
   - Autofill Pro
   - Recruiter Lens

3. **Interview better**
   - Interview Prep Pack

## Why this premium story works

Users do not pay for "more AI text."

Users do pay for:

- getting clearer direction on which jobs are worth effort
- faster, stronger applications on hard ATS flows
- better interview performance once they actually get the interview

So the premium stack must feel like:

> "Hyred helps me move from match to interview faster, with less wasted effort."

It must **not** feel like:

> "Hyred gives me more credits for generic generation."

---

## 3. Pricing And Paywall Strategy

## Recommended pricing

### Primary offer
- **Hyred Premium Sprint:** `₹2,799 / 90 days`

### Secondary offer
- **Hyred Premium Monthly:** `₹1,099 / month`

## Why the 90-day sprint is the hero

Job search is usually a short intense window, not a forever subscription.

The sprint:
- fits real user behavior better
- reduces monthly churn anxiety
- improves upfront cash collection
- matches the product's high-intent use case

## Guardrails

- Do **not** promise unlimited usage anywhere.
- Use quotas on all LLM-heavy features.
- Use higher limits on low-cost features and lower limits on expensive features.

## Free vs premium philosophy

Free tier should be useful enough to attract users, but weak enough that active job seekers hit a real wall quickly.

Premium should unlock:
- deeper decision support
- more tailored applications
- better interview conversion

---

## 4. Locked Feature Definitions

## Tier 1

### 4.1 Interview Prep Pack

**User problem**

The user gets an interview, but has no structured prep tied to:
- the actual JD
- their own resume
- their missing skills

**Premium value**

This is the strongest premium feature because interview-stage willingness to pay is highest.

**What it should do**

For a specific job, generate:
- likely interview questions
- role-specific technical questions
- behavioral questions
- gap-defense questions based on missing skills
- STAR-style suggested answers grounded in the resume
- "questions to ask the interviewer"
- quick-prep mode and deep-prep mode

**What it should not do**

- no fake live interview copilot
- no meeting bot
- no browser/tab surveillance
- no real-time answer whispering

**Free tier**
- 1 lifetime prep pack

**Premium**
- 8 prep packs per billing cycle

**Primary surface**
- job detail page

**Secondary surface**
- when status becomes `interviewing`

---

### 4.2 Match Intelligence

**User problem**

The user sees a match score and some skill gaps, but still cannot easily answer:
- should I apply?
- am I too junior?
- is this a stretch or a waste of time?
- why am I not getting callbacks?

**Premium value**

This becomes Hyred's paid intelligence layer.

**What it should do**

For each match, generate:
- verdict: `Apply` / `Stretch` / `Skip`
- seniority fit: underqualified / calibrated / overqualified
- top reasons for the verdict
- top actions to improve the odds

**What it should not do**

- no fake probability claims like "72% chance of interview"
- no black-box magic text without evidence

**Free tier**
- existing score and matched/missing skills remain free
- verdict preview can be blurred or partially shown

**Premium**
- full verdict on all matches

**Primary surface**
- job detail page

**Secondary surface**
- dashboard cards later

---

### 4.3 Resume Studio Pro

**User problem**

Users want more tailored ATS resumes, saved versions, and a simple way to reuse good resume variants across jobs.

**Premium value**

This is proven paid behavior. It is not the main moat by itself, but it is a strong premium anchor when bundled with the other features.

**What it should do**

- increase tailored resume quota
- save resume versions per job
- show version history
- allow re-open / re-download
- allow explicit labeling like "v1", "final", or timestamped versions

**What it should not do**

- no "unlimited tailored resumes"
- no rewrite-everything mode that ignores resume truth

**Free tier**
- 3 tailored resumes per month

**Premium**
- 40 tailored resumes per billing cycle
- saved version history

**Primary surface**
- job detail page

---

## Tier 2

### 4.4 Smart Scan Plus

**User problem**

Users want fresh, relevant jobs faster, especially high-match jobs before they become crowded.

**Premium value**

This helps retention and gives users a reason to come back often.

**What it should do**

- higher scan frequency for premium users
- more manual scan allowance
- instant alerts for high-match jobs
- priority freshness on strong matches

**What it should not do**

- no fake promise of exclusive jobs
- no promise that all jobs are posted before other platforms

**Free tier**
- existing scan cadence
- limited manual scans

**Premium**
- faster scans
- more manual scans
- high-match alerts

**Primary surface**
- dashboard
- email / in-app notification surface later

---

### 4.5 Autofill Pro

**User problem**

Long ATS flows, especially Workday, are painful and repetitive.

**Premium value**

Strong user value if extension quality is reliable.

**What it should do**

- higher autofill quota
- higher AI screening-answer quota
- premium-only limits, not premium-only capability

**What it should not do**

- no promise of perfect support on every ATS
- no auto-submit promise

**Free tier**
- 5 autofills per month
- 10 AI screening answers per month

**Premium**
- 100 autofills per billing cycle
- 150 AI screening answers per billing cycle

**Primary surface**
- extension

**Important note**

This should not be the headline premium promise until extension reliability is consistently strong.

---

### 4.8 Dream Company Job Alerts *(Tier 2 — building Jun 21, 2026)*

**User problem**

Users do not want "more jobs." They want to know **the moment their dream company posts a role** — before the listing gets buried or the req closes.

**Premium value**

High emotional intent, strong retention hook, natural upsell (more companies + faster channels). Complements Smart Scan Plus (generic high-match alerts) with **company-specific** alerts.

**What it should do**

- User picks dream companies from the curated MNC catalog (`lib/top-companies.ts` patterns — same word-boundary matching as Top MNC page).
- On every ingest scan (and manual import), when a **new match** appears for a job whose company matches a dream pick → create an alert.
- **Phase 1 (MVP):** in-app alert feed + sidebar nav entry; email/SMS toggles stored but delivery stubbed.
- **Phase 2:** instant email via Resend/SendGrid after ingest finalizes.
- **Phase 3:** SMS/WhatsApp on premium sprint (Twilio / WhatsApp Business) with strict opt-in and monthly caps.

**What it should not do**

- No free-text company names in v1 (false positives + support burden).
- No promise of "before LinkedIn" — only "as soon as Hyred ingests it."
- No unlimited SMS.

**Free vs premium**

| | Free | Premium |
|---|---|---|
| Dream companies | 1 | 10 |
| In-app alerts | Yes | Yes |
| Email | Daily digest (Phase 2) | Instant (Phase 2) |
| SMS | No | Capped (Phase 3) |

**Primary surface (locked for v1)**

- **Sidebar nav:** `Dream Alerts` placed **above ATS Checker** — aspirational utility next to free tools, not buried in Settings.
- **Route:** `/dream-alerts` — pick companies, view alert feed, channel preferences.

**Secondary surfaces (later)**

- Dashboard banner: "2 new roles at Google" when unread alerts exist.
- Job detail badge when match is from a dream company.
- Email subject line + deep link to `/jobs/[id]`.

**Why not Settings initially**

Settings = form memory (apply profile). Dream companies = **job-search intent**. Users think in goals ("I want Google"), not configuration. Sidebar discovery matches how LinkedIn / Wellfound surface "job alerts."

**Alternative placements considered**

| Place | Verdict |
|---|---|
| Above ATS Checker *(chosen)* | Best — visible, pairs with free tools, low friction |
| Below ATS Checker | Also fine; slightly less prominent |
| Dashboard card only | Too easy to miss on first visit |
| Settings | Wrong mental model; user rejected |

**Schema (migration 0016)**

- `dream_companies` — `(profile_id, company_key)` unique; `notify_email`, `notify_sms` prefs.
- `dream_company_alerts` — `(profile_id, job_id, dream_company_id)` unique; `read_at`, `email_sent_at`, `sms_sent_at`.

**Code map**

| Piece | Path |
|---|---|
| Catalog + matching | `lib/top-companies.ts` exports + `lib/dream-companies.ts` |
| Alert processor | `lib/dream-company-alerts.ts` — called from `lib/ingest.ts` + `app/api/import-job/route.ts` |
| CRUD API | `app/api/dream-companies/route.ts`, `[id]/route.ts`, `alerts/route.ts` |
| UI | `app/(app)/dream-alerts/page.tsx`, `DreamAlertsClient.tsx` |
| Nav | `app/(app)/_components/AppShell.tsx` — `Bell` icon, above ATS Checker |

**Ingest hook**

After successful `matches` upsert for a profile, load cached dream picks once per run → `processDreamCompanyAlertsForJob({ profileId, jobId, company, title })` → insert alert rows (deduped).

**Manual step:** run migration **0016** in Supabase before live testing.

---

## Tier 3

### 4.6 Application Health Report

**User problem**

Users apply for weeks and still do not know:
- whether their strategy is wrong
- whether low-score jobs are hurting them
- whether tailored resumes are actually helping

**Premium value**

This turns Hyred into a feedback system, not just a generation tool.

**What it should do**

Weekly or on-demand report:
- apply-to-interview funnel
- callback rate
- distribution by match score band
- top problems in the user's search behavior
- recommended adjustments

**What it should not do**

- no fake benchmark unless backed by actual internal data
- no overconfident causality claims

**Free tier**
- basic counts only

**Premium**
- full funnel analysis and recommendations

---

### 4.7 Recruiter Lens

**User problem**

Users do not know how their resume feels to a recruiter in the first 6–10 seconds.

**Premium value**

This is a strong upsell from ATS checker and resume optimization, but it is not a top-tier flagship feature.

**What it should do**

- fast recruiter-style resume audit
- seniority signal check
- weak bullet detection
- clarity and impact checks
- targeted rewrite suggestions

**What it should not do**

- do not duplicate ATS checker exactly
- do not duplicate Resume Studio Pro exactly

**Free tier**
- ATS checker remains free

**Premium**
- LLM-powered recruiter-lens audits with rewrite guidance

---

## 5. Final Packaging Recommendation

## The actual premium bundle

Hyred Premium should be positioned as:

> **Get better jobs, stronger applications, and better interview prep.**

### Included in Hyred Premium
- Interview Prep Pack
- Match Intelligence
- Resume Studio Pro
- Smart Scan Plus
- Autofill Pro
- Application Health Report
- Recruiter Lens
- existing cover letter / outreach quotas lifted into premium-friendly limits

## What should be the hero feature?

**Hero:** Interview Prep Pack

**Reason:** this is the cleanest and strongest paid value moment.

## What should be the core moat feature?

**Core moat:** Match Intelligence

**Reason:** this is the most Hyred-native intelligence feature.

## What should be the proven paid utility feature?

**Proven utility:** Resume Studio Pro

**Reason:** users already understand resume tailoring as something worth paying for.

---

## 6. Implementation Order

This order is now locked unless the founder explicitly changes it.

### Phase A — Tier 1
1. Interview Prep Pack
2. Match Intelligence
3. Resume Studio Pro

### Phase B — Tier 2
4. Smart Scan Plus
5. Autofill Pro

### Phase C — Tier 3
6. Application Health Report
7. Recruiter Lens

## Why this order

- Tier 1 creates the premium story
- Tier 2 improves retention and workflow value
- Tier 3 deepens insight and polish

---

## 7. Suggested UX Paywall Moments

These are the main upgrade triggers that should be designed into the product.

### Trigger 1 — Interview status change
When user changes a job to `interviewing`:

> "Unlock Interview Prep Pack for this job."

This is the strongest premium moment.

### Trigger 2 — Tailored resume quota wall
When user tries to generate the 4th tailored resume in the current cycle:

> "You've used your free tailored resumes. Upgrade to Resume Studio Pro."

### Trigger 3 — Blurred Match Intelligence verdict
On match detail page:

> show free score  
> blur `Apply / Stretch / Skip` verdict  
> prompt upgrade

### Trigger 4 — Extension quota wall
When user hits autofill or screening-answer cap:

> "Upgrade to Autofill Pro."

### Trigger 5 — Weekly search report teaser
Show partial funnel stat but blur the recommendation layer.

---

## 8. Technical Handoff For Coding Agents

This section is here so a future coding agent can continue implementation cleanly.

## Existing code areas that matter

### Core AI / match / resume logic
- `lib/gemini.ts`
- `lib/jd-fetcher.ts`
- `lib/search-profile.ts`
- `lib/profile-insights.ts`

### Match and job pages
- `app/(app)/page.tsx`
- `app/(app)/jobs/[id]/page.tsx`
- `app/(app)/jobs/[id]/JobActions.tsx`
- `app/api/matches/route.ts`
- `app/api/match/[id]/status/route.ts`

### Resume and cover letter APIs
- `app/api/match/[id]/resume/route.ts`
- `app/api/coverletter/route.ts`
- `app/api/match/[id]/outreach/route.ts`

### Extension and apply profile
- `app/(app)/apply-profile/page.tsx`
- `app/api/apply-profile/route.ts`
- `app/api/extension/*`
- `extension/content.js`
- `extension/background.js`
- `extension/popup.js`

### Stats and funnel data
- `app/(app)/stats/page.tsx`
- `lib/ingest-runs.ts`

### Billing / quota infrastructure (to be added or expanded)
- premium access flag on profile or separate subscription table
- usage tracking table for premium quotas
- helper for quota checks before expensive AI generation

## New likely files / areas by feature

### Interview Prep Pack
- `lib/interview-prep.ts`
- `app/api/match/[id]/prep/route.ts`
- UI section on job detail page

### Match Intelligence
- `lib/match-intelligence.ts`
- `app/api/match/[id]/verdict/route.ts`
- UI section or badge on job detail page

### Resume Studio Pro
- versioning helper and storage table
- resume version list UI on job detail page
- quota enforcement around tailored resume generation

### Smart Scan Plus
- quota and alert logic
- dashboard UI for premium scan benefits
- alert delivery later via email / in-app / extension

### Autofill Pro
- usage tracking on extension APIs
- upgrade messaging in extension and app

### Application Health Report
- analytics helper
- report page or dashboard module

### Recruiter Lens
- `lib/recruiter-lens.ts`
- dedicated route or ATS checker upsell entry

---

## 9. Data And Quota Requirements

Before or alongside feature implementation, agents should introduce a consistent premium usage model.

## Required concepts

1. **Premium access state**
   - free
   - premium monthly
   - premium sprint

2. **Usage ledger**
   Track per user and billing window:
   - prep packs used
   - tailored resumes used
   - autofills used
   - AI screening answers used
   - recruiter-lens audits used

3. **Quota check helper**
   One shared server-side helper should decide:
   - allowed
   - denied
   - remaining
   - reset date

4. **Paywall metadata**
   APIs should return useful paywall responses:
   - feature key
   - quota used
   - quota limit
   - upgrade message

## Important rule

All premium limits must be enforced **server-side**, not only in the client.

---

## 10. Agent Execution Rules

Future coding agents should follow these rules while implementing from this document.

1. Build **Tier 1 first**. Do not jump to Tier 3 because it feels easier.
2. Keep Hyred's core truth intact. Do not pivot product direction.
3. Reuse existing match, resume, and extension data wherever possible.
4. Do not add LinkedIn scraping, LinkedIn OAuth automation, or ATS auto-submit promises.
5. Do not ship unlimited LLM usage.
6. Design every premium feature around a clear user moment, not just "more generation."
7. Prefer durable tables and shared helpers over one-off quota checks.
8. Keep all premium copy simple and direct.

---

## 11. Success Criteria

This roadmap is successful if it produces a premium product that users can clearly understand.

## Product success
- users can immediately explain why premium exists
- premium does not feel like random credits
- Interview Prep Pack becomes the strongest upgrade trigger
- Match Intelligence strengthens Hyred's differentiation
- Resume Studio Pro turns existing value into a clean paywall

## Technical success
- quota checks are consistent
- premium features are resumable by any coding agent
- later features can build on the same billing and usage system

## Business success
- premium bundle justifies `₹1,099/mo`
- 90-day sprint becomes the main offer
- the free tier still attracts users without giving away the whole premium story

---

## 12. Immediate Next Step

After this document is approved, implementation should begin with:

1. **Tier 1 feature spec and execution plan**
   - Interview Prep Pack
   - Match Intelligence
   - Resume Studio Pro

2. Then **Tier 2 feature spec and execution plan**
   - Smart Scan Plus
   - Autofill Pro

3. Then **Tier 3**
   - Application Health Report
   - Recruiter Lens

If a future agent starts from this file, they should treat this document as the governing roadmap and create feature-specific implementation plans from it, not re-open the product strategy unless the founder changes scope.

---

## Status update (2026-06-20)

Tier 1 implementation shipped on branch `feat/tier-1-premium-features`:

- [x] `supabase/migrations/0015_hyred_premium_tier1.sql` — premium tables
- [x] `lib/premium.ts` — entitlement + quota helpers
- [x] `lib/match-intelligence.ts` + `app/api/match/[id]/verdict/route.ts`
- [x] `lib/interview-prep.ts` + `app/api/match/[id]/prep/route.ts`
- [x] `app/api/match/[id]/resume/route.ts` — Resume Studio Pro quotas + versions
- [x] `app/(app)/jobs/[id]/page.tsx` + `JobActions.tsx` — Tier 1 UI
- [x] Unit tests in `tests/unit/premium.test.ts`, `match-intelligence.test.ts`, `interview-prep.test.ts`
- [x] Implementation plan: `docs/superpowers/plans/2026-06-20-tier-1-premium-features.md`

**Not yet built:** Tier 2 (Smart Scan Plus, Autofill Pro), Tier 3 (Health Report, Recruiter Lens), Stripe billing UI.

**Manual step:** Run migration `0015_hyred_premium_tier1.sql` in Supabase before testing live.

**Dev testing premium:** Insert a row into `premium_subscriptions` for your `profile_id` with `plan = 'premium_sprint'` and `status = 'active'`.

---

## Status update (2026-06-21) — Dream Company Job Alerts

**Phase 1 MVP** (see §4.8):

- [x] Migration **0016**, lib + ingest hook, `/dream-alerts` UI, sidebar nav above ATS Checker
- [x] In-app alert feed (email/SMS delivery = Phase 2/3)

**Manual step:** Run migration **0016** in Supabase after merge.
