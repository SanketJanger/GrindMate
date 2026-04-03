export interface Problem {
  id?: number;
  leetcode_id?: number;
  title: string;
  difficulty: 'easy' | 'medium' | 'hard';
  patterns: string[];
  time_spent_min?: number;
  struggled: boolean;
  notes?: string;
  solved_at?: string;
}

export interface DailyActivity {
  date: string;
  problems_solved: number;
  total_time_min: number;
  patterns_practiced: string[];
}

export interface PatternProgress {
  pattern: string;
  solved_count: number;
  total_problems: number;
  last_practiced?: string;
}

export interface UserStats {
  total_problems: number;
  problems_by_difficulty: {
    easy: number;
    medium: number;
    hard: number;
  };
  patterns: PatternProgress[];
  current_streak: number;
  longest_streak: number;
  weak_patterns: string[];
  strong_patterns: string[];
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

export interface AgentState {
  messages: ChatMessage[];
  stats: UserStats | null;
  lastUpdated: string;
}

export interface ParsedProblem {
  leetcode_id?: number;
  title: string;
  difficulty: 'easy' | 'medium' | 'hard';
  patterns: string[];
  time_spent_min?: number;
  struggled: boolean;
}

export interface Recommendation {
  leetcode_id: number;
  title: string;
  difficulty: string;
  pattern: string;
  reason: string;
}

export interface Env {
  AI: Ai;
  DB: D1Database;
  GRINDMATE_AGENT: DurableObjectNamespace;
  ENVIRONMENT: string;
}

export interface AuthEnv extends Env {
  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string;
  SESSION_SECRET: string;
}
