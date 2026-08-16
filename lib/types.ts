export type Profile = {
  id: string;
  user_id: string | null;
  email: string;
  full_name: string | null;
  resume_text: string | null;
  resume_embedding: number[] | null;
  /** Private Storage path for the last uploaded source file (exact download). */
  resume_original_path?: string | null;
  resume_original_filename?: string | null;
  resume_original_mime?: string | null;
  preferences: Preferences;
  insights: ResumeInsights | null;
  created_at: string;
  updated_at: string;
};

export type ScoreWidenNotice = {
  previous_min_score: number;
  applied_min_score: number;
  matches_at_user_min: number;
  matches_after_widen: number;
  scan_at: string;
};

export type Preferences = {
  roles?: string[];
  min_score?: number;
  locations?: string[];
  remote_only?: boolean;
  exclude_keywords?: string[];
  blacklist_companies?: string[];
  /** Set when a scan auto-lowers min_score — cleared on dismiss or manual edit. */
  score_widen_notice?: ScoreWidenNotice | null;
};

import type { ProfileSeniority } from './profile-seniority';

export type ResumeInsights = {
  // Contact info extracted from the resume (used for autofill)
  full_name?: string;
  email?: string;
  current_location?: string;
  phone?: string;
  // Career signals
  years_experience?: number;
  seniority?: ProfileSeniority;
  top_skills?: string[];
  suggested_roles?: string[];
  summary?: string;
};

export type IngestRun = {
  id: string;
  started_at: string;
  finished_at: string | null;
  duration_ms: number | null;
  fetched: number;
  new_jobs: number;
  embedded: number;
  scored: number;
  matches_created: number;
  errors: { source: string; error: string }[];
  triggered_by: string;
  status: 'running' | 'success' | 'partial' | 'failed';
};

export type Job = {
  id: string;
  source: string;
  source_id: string;
  title: string;
  company: string | null;
  location: string | null;
  remote: boolean;
  url: string;
  description: string | null;
  salary: string | null;
  tags: string[] | null;
  posted_at: string | null;
  fetched_at: string;
  embedding: number[] | null;
};

export type Match = {
  id: string;
  profile_id: string;
  job_id: string;
  similarity: number | null;
  llm_score: number | null;
  reason: string | null;
  status: MatchStatus;
  cover_letter: string | null;
  applied_at: string | null;
  created_at: string;
  updated_at: string;
};

export type MatchStatus =
  | 'new'
  | 'viewed'
  | 'saved'
  | 'applied'
  | 'rejected'
  | 'interviewing'
  | 'offer'
  | 'closed';

export type PremiumPlan = 'free' | 'premium_monthly' | 'premium_sprint';

export type MatchVerdict = 'apply' | 'stretch' | 'skip';
export type SeniorityFit = 'underqualified' | 'calibrated' | 'overqualified';

export type MatchIntelligenceResult = {
  verdict: MatchVerdict;
  seniorityFit: SeniorityFit;
  reasons: string[];
  actions: string[];
};

export type InterviewPrepPack = {
  quickSummary: string;
  likelyQuestions: string[];
  technicalQuestions: string[];
  behavioralQuestions: string[];
  gapDefenseQuestions: string[];
  starAnswerHints: { question: string; answerHint: string }[];
  questionsToAsk: string[];
};

export type ResumeVersionSummary = {
  id: string;
  label: string | null;
  ats_match_score: number | null;
  created_at: string;
};

export type RawJob = {
  source: string;
  source_id: string;
  title: string;
  company: string | null;
  location: string | null;
  remote: boolean;
  url: string;
  description: string | null;
  salary: string | null;
  tags: string[] | null;
  posted_at: string | null;
};
