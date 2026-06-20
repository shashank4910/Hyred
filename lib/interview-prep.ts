import { chat } from '@/lib/gemini';
import type { InterviewPrepPack } from '@/lib/types';

export function normalizeInterviewPrep(input: Partial<InterviewPrepPack>): InterviewPrepPack {
  return {
    quickSummary: input.quickSummary ?? '',
    likelyQuestions: Array.isArray(input.likelyQuestions)
      ? input.likelyQuestions.slice(0, 5)
      : [],
    technicalQuestions: Array.isArray(input.technicalQuestions)
      ? input.technicalQuestions.slice(0, 5)
      : [],
    behavioralQuestions: Array.isArray(input.behavioralQuestions)
      ? input.behavioralQuestions.slice(0, 5)
      : [],
    gapDefenseQuestions: Array.isArray(input.gapDefenseQuestions)
      ? input.gapDefenseQuestions.slice(0, 3)
      : [],
    starAnswerHints: Array.isArray(input.starAnswerHints)
      ? input.starAnswerHints.slice(0, 3)
      : [],
    questionsToAsk: Array.isArray(input.questionsToAsk)
      ? input.questionsToAsk.slice(0, 3)
      : [],
  };
}

export async function generateInterviewPrep(args: {
  jobTitle: string;
  company: string | null;
  jobDescription: string;
  matchedSkills: string[];
  missingSkills: string[];
  resumeText: string;
  reason: string | null;
}): Promise<InterviewPrepPack> {
  const system = `You are Hyred's interview prep coach.
Return compact JSON with:
{
  "quickSummary": string,
  "likelyQuestions": string[],
  "technicalQuestions": string[],
  "behavioralQuestions": string[],
  "gapDefenseQuestions": string[],
  "starAnswerHints": [{ "question": string, "answerHint": string }],
  "questionsToAsk": string[]
}
Only use evidence from the resume and JD. Never invent achievements or tools.`;

  const raw = await chat(system, JSON.stringify(args), 0.3, true, 'generateInterviewPrep');
  return normalizeInterviewPrep(JSON.parse(raw) as Partial<InterviewPrepPack>);
}
