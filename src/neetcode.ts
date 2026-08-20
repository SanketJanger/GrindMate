import neetcode150 from './data/neetcode150.json';

export interface NeetCodeProblem {
  leetcode_id: number;
  title: string;
  difficulty: 'easy' | 'medium' | 'hard';
  category: string;
  slug: string;
  companies: string[];
}

export const NEETCODE_150 = neetcode150 as NeetCodeProblem[];

export const NEETCODE_CATEGORIES: string[] = Array.from(
  new Set(NEETCODE_150.map((p) => p.category))
);

// FAANG-only for now — company tags sourced from liquidslr/leetcode-company-wise-problems
// (community-aggregated LeetCode Premium data), cross-referenced against these 150
// problems by normalized title. Treat as "frequently associated with", not a guarantee.
export const NEETCODE_COMPANIES: string[] = Array.from(
  new Set(NEETCODE_150.flatMap((p) => p.companies))
).sort();

const COMPANY_ALIASES: Record<string, string> = {
  amazon: 'Amazon',
  google: 'Google',
  apple: 'Apple',
  netflix: 'Netflix',
  meta: 'Meta',
  facebook: 'Meta',
  fb: 'Meta',
};

// Finds a company mention anywhere in a chat message, e.g. "prep for amazon"
// or "meta interview prep". Used by handleCompanyRequest once detectIntent
// has already classified the message as COMPANY_PREP.
export function extractCompanyFromMessage(message: string): string | null {
  const lower = message.toLowerCase();
  for (const [alias, canonical] of Object.entries(COMPANY_ALIASES)) {
    if (new RegExp(`\\b${alias}\\b`).test(lower)) {
      return canonical;
    }
  }
  return null;
}

function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const BY_ID = new Map<number, NeetCodeProblem>(
  NEETCODE_150.map((p) => [p.leetcode_id, p])
);

const BY_TITLE = new Map<string, NeetCodeProblem>(
  NEETCODE_150.map((p) => [normalizeTitle(p.title), p])
);

// Matches a logged problem against the NeetCode 150 list, preferring
// leetcode_id (unambiguous) and falling back to a normalized title match.
export function matchNeetCodeProblem(
  leetcode_id?: number | null,
  title?: string | null
): NeetCodeProblem | null {
  if (leetcode_id != null) {
    const byId = BY_ID.get(leetcode_id);
    if (byId) return byId;
  }

  if (title) {
    const byTitle = BY_TITLE.get(normalizeTitle(title));
    if (byTitle) return byTitle;
  }

  return null;
}

// Maps the free-form pattern tags produced by the problem-logging AI
// (see PARSE_PROBLEM_PROMPT) to the NeetCode 150 category names they
// correspond to, so a weak pattern can be turned into concrete problem
// suggestions. Patterns with no reasonable NeetCode category (e.g. plain
// "recursion" or "sorting") are intentionally left unmapped.
export const PATTERN_TO_NEETCODE_CATEGORIES: Record<string, string[]> = {
  arrays: ['Arrays & Hashing'],
  hash_map: ['Arrays & Hashing'],
  two_pointers: ['Two Pointers'],
  sliding_window: ['Sliding Window'],
  binary_search: ['Binary Search'],
  linked_list: ['Linked List'],
  trees: ['Trees'],
  graphs: ['Graphs', 'Advanced Graphs'],
  bfs: ['Graphs', 'Trees'],
  dfs: ['Graphs', 'Trees'],
  dynamic_programming: ['1-D Dynamic Programming', '2-D Dynamic Programming'],
  backtracking: ['Backtracking'],
  greedy: ['Greedy'],
  heap: ['Heap / Priority Queue'],
  stack: ['Stack'],
  bit_manipulation: ['Bit Manipulation'],
  math: ['Math & Geometry'],
  intervals: ['Intervals'],
  tries: ['Tries'],
};
