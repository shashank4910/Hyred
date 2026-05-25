export type Profile = {
  id: string;
  email: string;
  full_name: string | null;
  resume_text: string | null;
  resume_embedding: number[] | null;
  preferences: Preferences;
  created_at: string;
  updated_at: string;
};

export type Preferences = {
  roles?: string[];
  min_score?: number;
  locations?: string[];
  remote_only?: boolean;
  exclude_keywords?: string[];
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
