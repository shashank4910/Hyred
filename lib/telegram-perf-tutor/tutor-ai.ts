import OpenAI from 'openai';
import { clampLevel } from './learner-store';
import { pickTopic, levelLabel } from './topics';
import type {
  Difficulty,
  GradeResult,
  LearnerProfile,
  LevelAssessment,
  PendingQuestion,
  TopicId,
} from './types';

function getClient(): { client: OpenAI; model: string; label: string } {
  const primary = (process.env.LLM_PRIMARY || 'groq').toLowerCase();
  const groqKey = process.env.GROQ_API_KEY?.trim();
  const openaiKey = process.env.OPENAI_API_KEY?.trim();

  const tryGroq = () => {
    if (!groqKey) return null;
    return {
      client: new OpenAI({ apiKey: groqKey, baseURL: 'https://api.groq.com/openai/v1' }),
      model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
      label: 'groq',
    };
  };
  const tryOpenAI = () => {
    if (!openaiKey) return null;
    return {
      client: new OpenAI({ apiKey: openaiKey }),
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      label: 'openai',
    };
  };

  // Prefer free/primary chat keys; also try cerebras-style env if present via groq/openai only here.
  const order =
    primary === 'openai' ? [tryOpenAI, tryGroq] : [tryGroq, tryOpenAI];
  for (const fn of order) {
    const hit = fn();
    if (hit) return hit;
  }
  throw new Error(
    'No GROQ_API_KEY or OPENAI_API_KEY found in env. Set a real value on Vercel / .env.local.',
  );
}

async function chatJson<T>(system: string, user: string): Promise<T> {
  const { client, model } = getClient();
  const res = await client.chat.completions.create({
    model,
    temperature: 0.55,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
  });
  const raw = res.choices[0]?.message?.content?.trim() || '{}';
  return JSON.parse(raw) as T;
}

function learnerContext(profile: LearnerProfile): string {
  const recent = profile.history.slice(-5).map((h) => ({
    topic: h.topic,
    difficulty: h.difficulty,
    score: h.score,
    verdict: h.verdict,
    q: h.question.slice(0, 120),
  }));
  return JSON.stringify(
    {
      displayName: profile.displayName,
      level: profile.level,
      levelLabel: levelLabel(profile.level),
      strengths: profile.strengths,
      weaknesses: profile.weaknesses,
      topicsSeen: profile.topicsSeen,
      topicScores: profile.topicScores,
      totalAnswered: profile.totalAnswered,
      tutorNotes: profile.notes,
      recentAnswers: recent,
    },
    null,
    2,
  );
}

export async function generateQuestion(
  profile: LearnerProfile,
  opts?: { avoidQuestions?: string[] },
): Promise<PendingQuestion> {
  const topic = pickTopic(profile.level, profile.topicsSeen, profile.weaknesses);
  const difficulty = profile.level;
  const avoid = (opts?.avoidQuestions || []).filter(Boolean).slice(0, 5);

  const system = `You are an expert performance testing & performance engineering tutor.
Ask ONE interview-style question. Return strict JSON only:
{
  "question": "the question text",
  "topic": "${topic.id}",
  "difficulty": ${difficulty}
}
Rules:
- Subject: performance testing / engineering only (load testing, metrics, bottlenecks, tools, capacity, SRE, etc.).
- Match difficulty ${difficulty}/10 (${levelLabel(difficulty)}).
- Prefer topic "${topic.title}" (${topic.blurb}).
- One clear question. No multiple choice. No spoilers or answer hints.
- If learner is beginner, keep language simple and concrete.
- If senior+, ask design / diagnosis / trade-off questions.
- Personalize lightly using learner strengths/weaknesses when useful.
- MUST ask a DIFFERENT question than any listed under "Do not repeat".`;

  const data = await chatJson<{ question: string; topic?: string; difficulty?: number }>(
    system,
    `Learner profile:\n${learnerContext(profile)}\n\n` +
      (avoid.length
        ? `Do not repeat these questions:\n${avoid.map((q, i) => `${i + 1}. ${q}`).join('\n')}\n\n`
        : '') +
      `Generate the next question.`,
  );

  let question =
    (data.question || '').trim() ||
    `Explain the main goal of ${topic.title} in performance engineering.`;

  // Soft guard if the model echoes the previous question.
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();
  if (avoid.some((a) => norm(a) === norm(question))) {
    question = `In the context of ${topic.title}: give a practical example of how you would measure success, and what signal would tell you something is wrong.`;
  }

  return {
    id: `q_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    topic: (data.topic as TopicId) || topic.id,
    difficulty: Math.max(1, Math.min(10, data.difficulty ?? difficulty)) as Difficulty,
    question,
    askedAt: new Date().toISOString(),
  };
}

export async function gradeAnswer(
  profile: LearnerProfile,
  pending: PendingQuestion,
  userAnswer: string,
): Promise<GradeResult> {
  const system = `You are a fair performance engineering tutor (not a video-game scorer).
Grade THIS answer for the stated difficulty. Return strict JSON:
{
  "score": 0-100,
  "verdict": "strong" | "partial" | "weak",
  "whatWasGood": "short",
  "gaps": "what was missing or wrong",
  "detailedAnswer": "a thorough model answer (short paragraphs and bullets). Include definitions, when to use, pitfalls, and a concrete example.",
  "keyTakeaways": ["3-5 short bullets"],
  "suggestedFocus": "what to practice next",
  "detectedStrengths": ["short tags"],
  "detectedWeaknesses": ["short tags"]
}
Judging rules:
- Score the substance, not length. A short correct answer at beginner difficulty can be strong.
- If core definitions are reversed or wrong, mark weak even if the writing sounds confident.
- Do NOT use fixed magic thresholds like "must be 80". Choose score/verdict from understanding quality.
- Be fair at low difficulty; still correct mistakes clearly.
detailedAnswer must be educational and complete even if the user was strong.`;

  const data = await chatJson<GradeResult>(
    system,
    `Learner profile:\n${learnerContext(profile)}

Question (topic=${pending.topic}, difficulty=${pending.difficulty}/10):
${pending.question}

Learner answer:
${userAnswer}

Grade and teach.`,
  );

  const score = Math.max(0, Math.min(100, Number(data.score) || 0));
  let verdict = data.verdict;
  if (verdict !== 'strong' && verdict !== 'partial' && verdict !== 'weak') {
    // Soft fallback only if the model omitted verdict — not used for leveling.
    verdict = score >= 75 ? 'strong' : score >= 50 ? 'partial' : 'weak';
  }

  return {
    score,
    verdict,
    whatWasGood: data.whatWasGood || '',
    gaps: data.gaps || '',
    detailedAnswer: data.detailedAnswer || '',
    keyTakeaways: Array.isArray(data.keyTakeaways) ? data.keyTakeaways.slice(0, 6) : [],
    suggestedFocus: data.suggestedFocus || '',
    detectedStrengths: Array.isArray(data.detectedStrengths) ? data.detectedStrengths : [],
    detectedWeaknesses: Array.isArray(data.detectedWeaknesses) ? data.detectedWeaknesses : [],
  };
}

/**
 * AI decides the learner's next difficulty level from answer quality + history.
 * No streak counters, no hard-coded 80-point rules.
 */
export async function reassessLevel(
  profile: LearnerProfile,
  pending: PendingQuestion,
  userAnswer: string,
  grade: GradeResult,
): Promise<LevelAssessment> {
  const system = `You are an adaptive performance-engineering coach building a model of this learner.
Decide their NEXT difficulty level (1-10) based on how they actually answer — not fixed score cutoffs or streak games.

Return strict JSON:
{
  "recommendedLevel": 1-10,
  "reason": "2-4 sentences explaining why this level fits them now",
  "expertiseSummary": "one short paragraph: how you currently read their expertise"
}

Level meaning:
1-2 beginner, 3-4 junior, 5-6 mid, 7-8 senior, 9-10 expert/architect.

Rules:
- Look at the latest answer AND recent history (trends matter more than one score).
- Raise level when they show solid understanding for the CURRENT difficulty (even if answers are concise).
- Lower level when they show confused/wrong fundamentals that need rebuilding — not for one small miss after strong work.
- Prefer staying at the same level when evidence is mixed.
- Do NOT require "two scores above 80". Judge conceptual readiness for harder questions.
- recommendedLevel should usually be within 1 of current level; only jump more if evidence is overwhelming.`;

  const data = await chatJson<{
    recommendedLevel?: number;
    reason?: string;
    expertiseSummary?: string;
  }>(
    system,
    `Current level: ${profile.level}/10 (${levelLabel(profile.level)})
Learner profile:\n${learnerContext(profile)}

Latest question (topic=${pending.topic}, difficulty=${pending.difficulty}/10):
${pending.question}

Latest answer:
${userAnswer}

Grade just produced (for context, not a hard rule):
score=${grade.score}, verdict=${grade.verdict}
good: ${grade.whatWasGood}
gaps: ${grade.gaps}

Reassess the learner's level.`,
  );

  return {
    recommendedLevel: clampLevel(Number(data.recommendedLevel) || profile.level),
    reason: (data.reason || 'Keeping level based on recent answer quality.').trim(),
    expertiseSummary: (data.expertiseSummary || '').trim(),
  };
}

export async function generateHint(
  profile: LearnerProfile,
  pending: PendingQuestion,
): Promise<string> {
  const system = `You help a performance engineering learner. Give a short hint (3-6 sentences), NOT the full answer.
Return JSON: { "hint": "..." }`;
  const data = await chatJson<{ hint: string }>(
    system,
    `Level ${profile.level}/10. Question:\n${pending.question}`,
  );
  return (
    data.hint?.trim() ||
    'Think about: what metric would you measure, how would you generate load, and what would a bottleneck look like?'
  );
}
