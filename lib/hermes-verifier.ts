import { llmJsonChat } from './gemini';

interface VerifyArgs {
  jobTitle: string;
  jobCompany: string | null;
  jobLocation: string | null;
  jobDescription: string | null;
  resumeText: string;
  insights: any;
  profileId?: string;
}

export interface HermesResult {
  action: 'keep' | 'filter';
  reason: string;
  adjustedScore?: number;
}

export async function verifyWithHermes({
  jobTitle,
  jobCompany,
  jobLocation,
  jobDescription,
  resumeText,
  insights,
  profileId,
}: VerifyArgs): Promise<HermesResult> {
  const systemPrompt = `You are Hermes, an elite technical recruiter and second-pass job auditing agent.
Your sole purpose is to verify job matches, identify subtle domain mismatches, and filter out irrelevant jobs while preserving true positives.
You must be precise, critical, and analytical. Do not accept broad category overlap (e.g. matching a performance engineer to a general QA Automation role is a mismatch).

You MUST respond in strict JSON format:
{
  "action": "keep" | "filter",
  "reason": "Detailed explanation of why this job is kept or filtered, highlighting domain, sub-specialty alignment, and tools.",
  "adjustedScore": 50
}`;

  const userPrompt = `Audit this job match to check for domain or sub-specialty alignment.

CANDIDATE PROFILE:
Resume excerpt/text:
${resumeText.slice(0, 4000)}

Candidate Insights:
${JSON.stringify(insights)}

JOB DETAILS:
Title: ${jobTitle}
Company: ${jobCompany || 'Unknown'}
Location: ${jobLocation || 'Unknown'}
Description:
${(jobDescription || '').slice(0, 4000)}

AUDIT ALIGNMENT CHECKLIST:
1. Dynamic Sub-Specialty & Domain Check:
   - Identify the candidate's core sub-specialty and primary expertise (from their resume and insights).
   - Identify the job's actual day-to-day focus and expected sub-specialty (from the JD).
   - Determine if there is a fundamental mismatch between the candidate's specific core track and the job expectations, even if they share a broad category/industry.
   - Use these exemplars to apply similar reasoning across ANY domain:
     - Performance Engineering (load, profiling) vs. general QA Automation (UI test scripts, manual QA).
     - Frontend UI Developer vs. Backend API/Database Developer.
     - Data Scientist (ML research) vs. Data Engineer (ETL pipelines).
     - DevOps/Platform vs. Software Feature Developer.
     - Product Manager (strategy, roadmap) vs. Project Manager / Scrum Master (timelines, sprints).
     - Product/UX Designer (user flows, wireframes) vs. Graphic/Visual Designer (marketing assets, brochures).
     - Cyber Security / Penetration Tester vs. General IT Helpdesk / Network Support.
2. If there is a clear mismatch or sub-specialty gap that makes the role irrelevant to the candidate's specific career track and expertise, return "action": "filter" and an "adjustedScore" of 50 (or lower).
3. If the candidate's background matches the requirements and domain well, return "action": "keep".`;

  try {
    const responseText = await llmJsonChat(systemPrompt, userPrompt, 0.1, profileId);
    const parsed = JSON.parse(responseText);
    
    const action = parsed.action === 'filter' ? 'filter' : 'keep';
    const reason = String(parsed.reason ?? '');
    const adjustedScore = parsed.adjustedScore != null ? Number(parsed.adjustedScore) : undefined;

    return {
      action,
      reason,
      adjustedScore,
    };
  } catch (e) {
    console.error('[hermes] Verification failed, defaulting to keep:', e);
    return {
      action: 'keep',
      reason: 'Hermes verification failed internally or failed to parse. Defaulted to keep.',
    };
  }
}
