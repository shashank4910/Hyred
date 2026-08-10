/** Difficulty 1 (basics) → 10 (expert / architect). */
export type Difficulty = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

export type TopicId =
  | 'fundamentals'
  | 'metrics'
  | 'load_types'
  | 'tools'
  | 'test_design'
  | 'bottlenecks'
  | 'profiling'
  | 'databases'
  | 'caching'
  | 'apis_protocols'
  | 'cloud_scale'
  | 'sre_slo'
  | 'chaos_resilience'
  | 'interview_scenarios';

export interface PendingQuestion {
  id: string;
  topic: TopicId;
  difficulty: Difficulty;
  question: string;
  askedAt: string;
}

export interface AnswerRecord {
  questionId: string;
  topic: TopicId;
  difficulty: Difficulty;
  question: string;
  userAnswer: string;
  score: number;
  verdict: 'strong' | 'partial' | 'weak';
  feedbackSummary: string;
  answeredAt: string;
  /** Level before / after AI reassessment for this answer. */
  levelBefore?: Difficulty;
  levelAfter?: Difficulty;
  levelReason?: string;
}

export interface LearnerProfile {
  telegramId: number;
  displayName: string;
  level: Difficulty;
  strengths: string[];
  weaknesses: string[];
  topicsSeen: TopicId[];
  topicScores: Partial<Record<TopicId, number>>;
  /** @deprecated Kept for old saved profiles; no longer used for leveling. */
  consecutiveStrong: number;
  /** @deprecated Kept for old saved profiles; no longer used for leveling. */
  consecutiveWeak: number;
  totalAnswered: number;
  pending: PendingQuestion | null;
  history: AnswerRecord[];
  notes: string;
  /** Latest AI note about how it reads your expertise. */
  expertiseSummary?: string;
  createdAt: string;
  updatedAt: string;
}

export interface GradeResult {
  score: number;
  verdict: 'strong' | 'partial' | 'weak';
  whatWasGood: string;
  gaps: string;
  detailedAnswer: string;
  keyTakeaways: string[];
  suggestedFocus: string;
  detectedStrengths: string[];
  detectedWeaknesses: string[];
}

export interface LevelAssessment {
  recommendedLevel: Difficulty;
  reason: string;
  expertiseSummary: string;
}
