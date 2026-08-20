import { Env, Problem, UserStats, PatternProgress, ChatMessage } from './types';
import { chat, parseProblem, detectIntent, getRecommendations, getWeeklySummary } from './ai';
import { matchNeetCodeProblem, NEETCODE_150, PATTERN_TO_NEETCODE_CATEGORIES } from './neetcode';
import { GUEST_USER_ID } from './auth';

interface ReviewItem {
  id: string;
  leetcode_id: number | null;
  title: string;
  difficulty: string;
  patterns: string[];
  solved_on: string;      // date the problem was originally solved, YYYY-MM-DD
  struggled: boolean;     // priority signal only — does not gate scheduling
  review_number: number;  // 1, 2, or 3
  scheduled_for: string;  // ISO datetime string of when this review is due
  completed: boolean;
}

// Spaced-repetition intervals: review #1 is scheduled 1 day after solving;
// #2 and #3 are each scheduled that many days after the *previous* review
// is marked complete (see markReviewCompleted), not upfront.
const REVIEW_INTERVAL_DAYS = [1, 3, 7];

function normalizeForMatch(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function titleCase(text: string): string {
  return text
    .replace(/_/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

// Recognizes chat phrasing like "reviewed two sum" or "done with two sum
// review" so handleLogProblem can route it to review completion instead of
// trying to parse it as a newly solved problem.
function extractReviewCompletionTitle(message: string): string | null {
  const patterns = [
    /done (?:with|reviewing)\s+(.+?)(?:\s+review)?[.!]?$/i,
    /finished (?:reviewing\s+)?(.+?)(?:\s+review)?[.!]?$/i,
    /completed\s+(.+?)\s+review[.!]?$/i,
    /reviewed\s+(.+?)[.!]?$/i,
  ];

  for (const pattern of patterns) {
    const match = message.match(pattern);
    if (match?.[1]?.trim()) {
      return match[1].trim();
    }
  }
  return null;
}

// Recognizes "re-attempt two sum" or "yes re-attempt two sum" so
// handleLogProblem can route it to logReAttempt instead of the normal
// AI-parsed log flow.
function extractReAttemptTitle(message: string): string | null {
  const match = message.match(/^(?:yes\s+)?re-?attempt(?:ed)?\s+(.+?)[.!]?$/i);
  return match?.[1]?.trim() || null;
}

// Recognizes "add this also into review" / "add this to review" / "add to
// reviews" — every logged problem already gets a review scheduled
// automatically, so there is no manual "add to review" action to perform.
function isManualAddToReviewRequest(message: string): boolean {
  return /^add\s+(?:this\s+)?(?:also\s+)?(?:to|into)\s+(?:my\s+)?reviews?\b/i.test(message.trim());
}

const GUEST_READONLY_MESSAGE = `🔒 This is a **read-only demo** — problem logging is disabled so the sample data stays intact for other visitors.\n\nLogin with GitHub to start tracking your own progress: your problems, streaks, and NeetCode 150 progress would be saved just like this demo data.`;

interface GuestSeedProblem {
  leetcode_id: number;
  title: string;
  difficulty: 'easy' | 'medium' | 'hard';
  patterns: string[];
  timeSpentMin: number;
  daysAgo: number;
  neetcode: boolean;
  neetcodeCategory: string | null;
  struggled?: boolean;
}

// Demo data for the guest_demo account, oldest first so pattern_progress's
// last_practiced ends up as the most recent date for each pattern.
// Days 0-6 each have >=1 problem to produce a clean 7-day current streak;
// days 7-8 are deliberately empty so the streak doesn't run longer than that.
// Arrays & Hashing (4/9), Two Pointers (2/5), and Trees (3/15) are seeded
// as partially solved so the NeetCode dashboard shows in-progress categories.
const GUEST_SEED_PROBLEMS: GuestSeedProblem[] = [
  { leetcode_id: 547, title: 'Number of Provinces', difficulty: 'medium', patterns: ['graphs'], timeSpentMin: 28, daysAgo: 13, neetcode: false, neetcodeCategory: null },
  { leetcode_id: 516, title: 'Longest Palindromic Subsequence', difficulty: 'medium', patterns: ['dynamic_programming'], timeSpentMin: 35, daysAgo: 12, neetcode: false, neetcodeCategory: null },
  { leetcode_id: 132, title: 'Palindrome Partitioning II', difficulty: 'hard', patterns: ['dynamic_programming'], timeSpentMin: 50, daysAgo: 12, neetcode: false, neetcodeCategory: null, struggled: true },
  { leetcode_id: 113, title: 'Path Sum II', difficulty: 'medium', patterns: ['trees', 'backtracking'], timeSpentMin: 25, daysAgo: 11, neetcode: false, neetcodeCategory: null },
  { leetcode_id: 47, title: 'Permutations II', difficulty: 'medium', patterns: ['backtracking'], timeSpentMin: 22, daysAgo: 11, neetcode: false, neetcodeCategory: null },
  { leetcode_id: 140, title: 'Word Break II', difficulty: 'hard', patterns: ['dynamic_programming', 'backtracking'], timeSpentMin: 48, daysAgo: 10, neetcode: false, neetcodeCategory: null, struggled: true },
  { leetcode_id: 112, title: 'Path Sum', difficulty: 'easy', patterns: ['trees'], timeSpentMin: 12, daysAgo: 10, neetcode: false, neetcodeCategory: null },
  { leetcode_id: 64, title: 'Minimum Path Sum', difficulty: 'medium', patterns: ['dynamic_programming'], timeSpentMin: 20, daysAgo: 9, neetcode: false, neetcodeCategory: null },
  { leetcode_id: 63, title: 'Unique Paths II', difficulty: 'medium', patterns: ['dynamic_programming'], timeSpentMin: 18, daysAgo: 9, neetcode: false, neetcodeCategory: null },
  { leetcode_id: 1, title: 'Two Sum', difficulty: 'easy', patterns: ['arrays_hashing'], timeSpentMin: 10, daysAgo: 6, neetcode: true, neetcodeCategory: 'Arrays & Hashing' },
  { leetcode_id: 100, title: 'Same Tree', difficulty: 'easy', patterns: ['trees'], timeSpentMin: 8, daysAgo: 6, neetcode: true, neetcodeCategory: 'Trees' },
  { leetcode_id: 217, title: 'Contains Duplicate', difficulty: 'easy', patterns: ['arrays_hashing'], timeSpentMin: 9, daysAgo: 5, neetcode: true, neetcodeCategory: 'Arrays & Hashing' },
  { leetcode_id: 242, title: 'Valid Anagram', difficulty: 'easy', patterns: ['arrays_hashing'], timeSpentMin: 11, daysAgo: 4, neetcode: true, neetcodeCategory: 'Arrays & Hashing' },
  { leetcode_id: 49, title: 'Group Anagrams', difficulty: 'medium', patterns: ['arrays_hashing'], timeSpentMin: 20, daysAgo: 3, neetcode: true, neetcodeCategory: 'Arrays & Hashing' },
  { leetcode_id: 125, title: 'Valid Palindrome', difficulty: 'easy', patterns: ['two_pointers'], timeSpentMin: 9, daysAgo: 2, neetcode: true, neetcodeCategory: 'Two Pointers' },
  { leetcode_id: 11, title: 'Container With Most Water', difficulty: 'medium', patterns: ['two_pointers'], timeSpentMin: 18, daysAgo: 1, neetcode: true, neetcodeCategory: 'Two Pointers' },
  { leetcode_id: 226, title: 'Invert Binary Tree', difficulty: 'easy', patterns: ['trees'], timeSpentMin: 7, daysAgo: 0, neetcode: true, neetcodeCategory: 'Trees' },
  { leetcode_id: 104, title: 'Maximum Depth of Binary Tree', difficulty: 'easy', patterns: ['trees'], timeSpentMin: 6, daysAgo: 0, neetcode: true, neetcodeCategory: 'Trees' },
];

export class GrindMateAgent {
  private state: DurableObjectState;
  private env: Env;
  // DurableObjectId.name is not reliably populated on the DO's own
  // state.id at runtime, so the per-user scope key can't be inferred from
  // identity alone — index.ts passes it explicitly via the X-User-Id
  // header on every request instead (see fetch() below).
  private userId: string = 'default';
  private messages: ChatMessage[] = [];
  private reviewQueue: ReviewItem[] = [];

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;

    this.state.blockConcurrencyWhile(async () => {
      const storedMessages = await this.state.storage.get<ChatMessage[]>('messages');
      this.messages = storedMessages || [];

      const storedReviews = await this.state.storage.get<ReviewItem[]>('reviewQueue');
      this.reviewQueue = storedReviews || [];
    });
  }

  private get isGuest(): boolean {
    return this.userId === GUEST_USER_ID;
  }

  // Populates the shared guest_demo account with a realistic solve history
  // the first time its Durable Object is constructed. Guarded by the
  // problems count so it never re-seeds (and never overwrites) on later
  // requests once data exists.
  private async seedGuestDataIfEmpty(): Promise<void> {
    const existing = await this.env.DB.prepare(`
      SELECT COUNT(*) as count FROM problems WHERE user_id = ?
    `).bind(GUEST_USER_ID).first() as { count: number } | null;

    if (existing && existing.count > 0) return;

    const now = Date.now();
    // Every logged problem gets a review scheduled in the real flow, but for
    // a demo account we only backdate a handful into "due now" — enough to
    // show both priority tiers (struggled vs. not) without flooding the list.
    const REVIEW_DEMO_TITLES = ['Palindrome Partitioning II', 'Word Break II', 'Two Sum'];
    const reviewSeedTargets: { leetcode_id: number; title: string; difficulty: string; patterns: string[]; struggled: boolean; solvedOn: string }[] = [];

    for (const seed of GUEST_SEED_PROBLEMS) {
      const solvedAt = new Date(now - seed.daysAgo * 24 * 60 * 60 * 1000).toISOString();
      const solvedDate = solvedAt.split('T')[0];

      await this.env.DB.prepare(`
        INSERT INTO problems (user_id, leetcode_id, title, difficulty, patterns, time_spent_min, struggled, solved_at, neetcode, neetcode_category)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        GUEST_USER_ID,
        seed.leetcode_id,
        seed.title,
        seed.difficulty,
        JSON.stringify(seed.patterns),
        seed.timeSpentMin,
        seed.struggled ? 1 : 0,
        solvedAt,
        seed.neetcode ? 1 : 0,
        seed.neetcodeCategory
      ).run();

      await this.env.DB.prepare(`
        INSERT INTO daily_activity (user_id, date, problems_solved, total_time_min)
        VALUES (?, ?, 1, ?)
        ON CONFLICT(user_id, date) DO UPDATE SET
          problems_solved = problems_solved + 1,
          total_time_min = total_time_min + excluded.total_time_min
      `).bind(GUEST_USER_ID, solvedDate, seed.timeSpentMin).run();

      for (const pattern of seed.patterns) {
        await this.env.DB.prepare(`
          INSERT INTO pattern_progress (user_id, pattern, solved_count, last_practiced)
          VALUES (?, ?, 1, ?)
          ON CONFLICT(user_id, pattern) DO UPDATE SET
            solved_count = solved_count + 1,
            last_practiced = excluded.last_practiced
        `).bind(GUEST_USER_ID, pattern, solvedAt).run();
      }

      if (REVIEW_DEMO_TITLES.includes(seed.title)) {
        reviewSeedTargets.push({
          leetcode_id: seed.leetcode_id,
          title: seed.title,
          difficulty: seed.difficulty,
          patterns: seed.patterns,
          struggled: !!seed.struggled,
          solvedOn: solvedDate,
        });
      }
    }

    // Backdate these into the past so they show up as already due, rather
    // than scheduling them forward like a fresh log would. Mixing struggled
    // and non-struggled demonstrates the priority ordering in the reviews list.
    const overdueOffsetsMs = [2 * 24 * 60 * 60 * 1000, 18 * 60 * 60 * 1000, 6 * 60 * 60 * 1000];
    for (const [i, target] of reviewSeedTargets.entries()) {
      this.reviewQueue.push({
        id: crypto.randomUUID(),
        leetcode_id: target.leetcode_id,
        title: target.title,
        difficulty: target.difficulty,
        patterns: target.patterns,
        solved_on: target.solvedOn,
        struggled: target.struggled,
        review_number: 1,
        scheduled_for: new Date(now - (overdueOffsetsMs[i] ?? 24 * 60 * 60 * 1000)).toISOString(),
        completed: false,
      });
    }
    await this.state.storage.put('reviewQueue', this.reviewQueue);
    await this.scheduleNextAlarm();
  }

  async alarm(): Promise<void> {
    const due = this.getDueReviews();
    if (due.length > 0) {
      console.log(`${due.length} review(s) are now due`);
    }

    // Due-ness itself is always computed live from scheduled_for/completed
    // (see getDueReviews) rather than mutated here, so it stays correct even
    // if this alarm never fires before the user checks — the alarm only
    // exists to keep waking the DO up for the next milestone.
    await this.scheduleNextAlarm();
  }

  // "Due" is derived on demand, never cached: a review is due once its
  // date has arrived and it hasn't been completed yet.
  private getDueReviews(): ReviewItem[] {
    const today = new Date().toISOString().split('T')[0];
    return this.reviewQueue.filter(r => !r.completed && r.scheduled_for.split('T')[0] <= today);
  }

  // Points the DO alarm at the earliest not-yet-due pending review so the
  // DO wakes up again for it. Reviews that are already due don't need an
  // alarm — they're already discoverable via getDueReviews() — and pointing
  // the alarm at one would just make it refire immediately forever.
  private async scheduleNextAlarm(): Promise<void> {
    const now = Date.now();
    const upcoming = this.reviewQueue.filter(r => !r.completed && new Date(r.scheduled_for).getTime() > now);
    if (upcoming.length === 0) return;

    const next = Math.min(...upcoming.map(r => new Date(r.scheduled_for).getTime()));
    await this.state.storage.setAlarm(next);
  }

  // Marks a review complete and, unless this was the 3rd and final review,
  // schedules the next one in the chain now — review #1 done schedules #2
  // in 3 days, #2 done schedules #3 in 7 days, #3 done means mastered.
  private async markReviewCompleted(review: ReviewItem): Promise<ReviewItem | undefined> {
    review.completed = true;

    let nextReview = this.reviewQueue.find(r =>
      !r.completed &&
      r.title === review.title &&
      r.leetcode_id === review.leetcode_id &&
      r.review_number === review.review_number + 1
    );

    if (!nextReview && review.review_number < REVIEW_INTERVAL_DAYS.length) {
      nextReview = {
        id: crypto.randomUUID(),
        leetcode_id: review.leetcode_id,
        title: review.title,
        difficulty: review.difficulty,
        patterns: review.patterns,
        solved_on: review.solved_on,
        struggled: review.struggled,
        review_number: review.review_number + 1,
        scheduled_for: new Date(Date.now() + REVIEW_INTERVAL_DAYS[review.review_number] * 24 * 60 * 60 * 1000).toISOString(),
        completed: false,
      };
      this.reviewQueue.push(nextReview);
    }

    await this.state.storage.put('reviewQueue', this.reviewQueue);
    await this.scheduleNextAlarm();

    return nextReview;
  }

  async fetch(request: Request): Promise<Response> {
    this.userId = request.headers.get('X-User-Id') || 'default';

    if (this.isGuest) {
      await this.seedGuestDataIfEmpty();
    }

    const url = new URL(request.url);

    if (request.headers.get('Upgrade') === 'websocket') {
      return this.handleWebSocket(request);
    }

    if (url.pathname === '/chat' && request.method === 'POST') {
      return this.handleChat(request);
    }

    if (url.pathname === '/stats' && request.method === 'GET') {
      return this.handleGetStats();
    }

    if (url.pathname === '/neetcode/progress' && request.method === 'GET') {
      return this.handleGetNeetCodeProgress();
    }

    if (url.pathname === '/needs-practice' && request.method === 'GET') {
      return this.handleGetNeedsPractice();
    }

    if (url.pathname === '/history' && request.method === 'GET') {
      return this.handleGetHistory();
    }

    if (url.pathname === '/import' && request.method === 'POST') {
      return this.handleImport(request);
    }

    if (url.pathname === '/reviews' && request.method === 'GET') {
      return this.handleGetReviews();
    }

    if (url.pathname === '/reviews/complete' && request.method === 'POST') {
      return this.handleCompleteReview(request);
    }

    return new Response('Not Found', { status: 404 });
  }

  // Schedules review #1 (1 day out) for a just-logged problem. Every logged
  // problem gets this — struggled is stored for priority/sorting only, it
  // no longer decides whether a review happens. #2 and #3 aren't created
  // here; markReviewCompleted creates each one only once its predecessor
  // is marked done.
  private async scheduleReviews(problem: {
    leetcode_id: number | null;
    title: string;
    difficulty: string;
    patterns: string[];
    struggled: boolean;
    solvedAt: string;
  }): Promise<void> {
    this.reviewQueue.push({
      id: crypto.randomUUID(),
      leetcode_id: problem.leetcode_id,
      title: problem.title,
      difficulty: problem.difficulty,
      patterns: problem.patterns,
      solved_on: problem.solvedAt.split('T')[0],
      struggled: problem.struggled,
      review_number: 1,
      scheduled_for: new Date(Date.now() + REVIEW_INTERVAL_DAYS[0] * 24 * 60 * 60 * 1000).toISOString(),
      completed: false,
    });

    await this.state.storage.put('reviewQueue', this.reviewQueue);
    await this.scheduleNextAlarm();
  }

  // Matches chat phrasing like "reviewed two sum" against the pending
  // queue by normalized title and marks the earliest matching review done.
  private async completeReviewByTitle(rawTitle: string): Promise<string> {
    const normalized = normalizeForMatch(rawTitle);

    const review = this.reviewQueue
      .filter(r => !r.completed)
      .filter(r => {
        const candidate = normalizeForMatch(r.title);
        return candidate === normalized || candidate.includes(normalized) || normalized.includes(candidate);
      })
      .sort((a, b) => a.review_number - b.review_number)[0];

    if (!review) {
      return `Couldn't find a pending review for "${rawTitle}". Say 'show my reviews' to check.`;
    }

    const reviewNumber = review.review_number;
    const nextReview = await this.markReviewCompleted(review);

    if (!nextReview) {
      return `✅ ${review.title} review #${reviewNumber} done!\n🎉 Mastered — no more reviews!`;
    }

    const daysUntilNext = REVIEW_INTERVAL_DAYS[reviewNumber];
    return `✅ ${review.title} review #${reviewNumber} done!\n🔔 Next review in ${daysUntilNext} day${daysUntilNext === 1 ? '' : 's'}`;
  }

  private async handleGetReviews(): Promise<Response> {
    const due = this.getDueReviews();
    const pending = this.reviewQueue.filter(r => !r.completed);

    return Response.json({
      due,
      upcoming: pending.length - due.length,
      total: pending.length,
    });
  }

  private async handleCompleteReview(request: Request): Promise<Response> {
    if (this.isGuest) {
      return Response.json(
        { error: 'Demo reviews are read-only. Login with GitHub to track your own reviews.' },
        { status: 403 }
      );
    }

    try {
      const { id } = await request.json() as { id: string };
      const review = this.reviewQueue.find(r => r.id === id && !r.completed);

      if (!review) {
        return Response.json({ error: 'Review not found or already completed' }, { status: 404 });
      }

      const nextReview = await this.markReviewCompleted(review);

      return Response.json({
        success: true,
        completed: { id: review.id, title: review.title, review_number: review.review_number },
        next_review: nextReview
          ? { id: nextReview.id, review_number: nextReview.review_number, scheduled_for: nextReview.scheduled_for }
          : null,
      });
    } catch (error) {
      return Response.json({ error: 'Failed to complete review' }, { status: 500 });
    }
  }

  private async handleImport(request: Request): Promise<Response> {
    if (this.isGuest) {
      return Response.json(
        { error: 'Import is disabled in demo mode. Login with GitHub to import your own LeetCode history.' },
        { status: 403 }
      );
    }

    try {
      const { title, difficulty, patterns, timestamp } = await request.json() as {
        title: string;
        difficulty: string;
        patterns: string[];
        timestamp?: string;
      };

      const solvedAt = timestamp
        ? new Date(parseInt(timestamp) * 1000).toISOString()
        : new Date().toISOString();

      const neetcodeMatch = matchNeetCodeProblem(null, title);

      await this.env.DB.prepare(`
        INSERT INTO problems (user_id, leetcode_id, title, difficulty, patterns, solved_at, neetcode, neetcode_category)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        this.userId,
        neetcodeMatch?.leetcode_id ?? null,
        title,
        difficulty,
        JSON.stringify(patterns),
        solvedAt,
        neetcodeMatch ? 1 : 0,
        neetcodeMatch?.category ?? null
      ).run();

      const solvedDate = solvedAt.split('T')[0];
      await this.env.DB.prepare(`
        INSERT INTO daily_activity (user_id, date, problems_solved, total_time_min)
        VALUES (?, ?, 1, 0)
        ON CONFLICT(user_id, date) DO UPDATE SET problems_solved = problems_solved + 1
      `).bind(this.userId, solvedDate).run();

      for (const pattern of patterns) {
        await this.env.DB.prepare(`
          INSERT INTO pattern_progress (user_id, pattern, solved_count, last_practiced)
          VALUES (?, ?, 1, datetime('now'))
          ON CONFLICT(user_id, pattern) DO UPDATE SET
            solved_count = solved_count + 1,
            last_practiced = datetime('now')
        `).bind(this.userId, pattern).run();
      }

      return Response.json({ success: true, title });
    } catch (error) {
      console.error('Import error:', error);
      return Response.json({ error: 'Import failed' }, { status: 500 });
    }
  }

  private async handleChat(request: Request): Promise<Response> {
    try {
      const { message } = await request.json() as { message: string };
      
      if (!message || typeof message !== 'string') {
        return Response.json({ error: 'Message required' }, { status: 400 });
      }

      const userMsg: ChatMessage = {
        role: 'user',
        content: message,
        timestamp: new Date().toISOString()
      };
      this.messages.push(userMsg);

      const intent = await detectIntent(this.env, message);
      let response: string;

      switch (intent) {
        case 'LOG_PROBLEM':
          response = await this.handleLogProblem(message);
          break;
        case 'GET_STATS':
          response = await this.handleStatsRequest();
          break;
        case 'GET_RECOMMENDATION':
          response = await this.handleRecommendationRequest();
          break;
        case 'GET_WEEKLY_SUMMARY':
          response = await this.handleWeeklySummaryRequest();
          break;
        case 'GET_REVIEWS':
          response = await this.handleReviewsRequest();
          break;
        default:
          response = await this.handleGeneralChat(message);
      }

      const assistantMsg: ChatMessage = {
        role: 'assistant',
        content: response,
        timestamp: new Date().toISOString()
      };
      this.messages.push(assistantMsg);

      // Guest is a single shared identity across every visitor — never
      // persist its chat history so one demo session can't bleed into another.
      if (!this.isGuest) {
        const toStore = this.messages.slice(-100);
        await this.state.storage.put('messages', toStore);
      }

      return Response.json({ response, intent, timestamp: assistantMsg.timestamp });
    } catch (error) {
      console.error('Chat error:', error);
      return Response.json({ error: 'Failed to process message' }, { status: 500 });
    }
  }

  // Logs a re-attempt of a problem the user already has on record, carrying
  // forward its metadata (title/difficulty/patterns/leetcode_id) rather than
  // re-parsing it — the trigger phrase has no such details to extract.
  // Deliberately does not call scheduleReviews: the original review chain
  // for this problem already exists.
  private async logReAttempt(rawTitle: string): Promise<string> {
    const normalized = normalizeForMatch(rawTitle);

    const rows = await this.env.DB.prepare(`
      SELECT leetcode_id, title, difficulty, patterns, neetcode, neetcode_category
      FROM problems
      WHERE user_id = ?
      ORDER BY solved_at DESC
    `).bind(this.userId).all();

    const source = (rows.results || []).find((row: any) => {
      const candidate = normalizeForMatch(row.title);
      return candidate === normalized || candidate.includes(normalized) || normalized.includes(candidate);
    }) as any;

    if (!source) {
      return `I don't see a previous log for "${rawTitle}" yet. Log it fresh first, then you can re-attempt it later!`;
    }

    const today = new Date().toISOString().split('T')[0];

    await this.env.DB.prepare(`
      INSERT INTO problems (user_id, leetcode_id, title, difficulty, patterns, struggled, solved_at, neetcode, neetcode_category, re_attempt)
      VALUES (?, ?, ?, ?, ?, 0, datetime('now'), ?, ?, 1)
    `).bind(
      this.userId,
      source.leetcode_id,
      source.title,
      source.difficulty,
      source.patterns,
      source.neetcode,
      source.neetcode_category
    ).run();

    await this.env.DB.prepare(`
      INSERT INTO daily_activity (user_id, date, problems_solved, total_time_min)
      VALUES (?, ?, 1, 0)
      ON CONFLICT(user_id, date) DO UPDATE SET problems_solved = problems_solved + 1
    `).bind(this.userId, today).run();

    const patterns: string[] = JSON.parse(source.patterns || '[]');
    for (const pattern of patterns) {
      await this.env.DB.prepare(`
        INSERT INTO pattern_progress (user_id, pattern, solved_count, last_practiced)
        VALUES (?, ?, 1, datetime('now'))
        ON CONFLICT(user_id, pattern) DO UPDATE SET
          solved_count = solved_count + 1,
          last_practiced = datetime('now')
      `).bind(this.userId, pattern).run();
    }

    return `✅ Re-attempt logged: ${source.title} (${capitalize(source.difficulty)})\nKeep grinding! 💪`;
  }

  private async handleLogProblem(message: string): Promise<string> {
    if (isManualAddToReviewRequest(message)) {
      return "Reviews are scheduled automatically for every problem you log! Check your Reviews Due on the dashboard.";
    }

    const reviewCompletionTitle = extractReviewCompletionTitle(message);
    if (reviewCompletionTitle) {
      if (this.isGuest) return GUEST_READONLY_MESSAGE;
      return await this.completeReviewByTitle(reviewCompletionTitle);
    }

    const reAttemptTitle = extractReAttemptTitle(message);
    if (reAttemptTitle) {
      if (this.isGuest) return GUEST_READONLY_MESSAGE;
      return await this.logReAttempt(reAttemptTitle);
    }

    const parsed = await parseProblem(this.env, message);

    if (!parsed) {
      return "I couldn't parse that problem. Try: 'Solved LC 121 Two Sum, easy, 15 min'";
    }

    const neetcodeMatch = matchNeetCodeProblem(parsed.leetcode_id, parsed.title);
    // Backfill the canonical leetcode_id when the parser couldn't extract one,
    // so NeetCode progress can dedupe reliably by id.
    const leetcodeId = parsed.leetcode_id ?? neetcodeMatch?.leetcode_id ?? null;

    // Dedup check runs even for guest, so they see the right message
    // instead of always hitting the generic read-only wall below.
    const existing = await this.env.DB.prepare(`
      SELECT id, title FROM problems
      WHERE user_id = ? AND (leetcode_id = ? OR LOWER(title) = LOWER(?))
      LIMIT 1
    `).bind(this.userId, leetcodeId, parsed.title).first() as { id: number; title: string } | null;

    if (existing) {
      return `⚠️ You've already logged ${existing.title}.\nReply 'yes re-attempt ${existing.title}' to log again.`;
    }

    if (this.isGuest) return GUEST_READONLY_MESSAGE;

    const today = new Date().toISOString().split('T')[0];

    try {
      const result = await this.env.DB.prepare(`
        INSERT INTO problems (user_id, leetcode_id, title, difficulty, patterns, time_spent_min, struggled, solved_at, neetcode, neetcode_category)
        VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), ?, ?)
        RETURNING id
      `).bind(
        this.userId,
        leetcodeId,
        parsed.title,
        parsed.difficulty,
        JSON.stringify(parsed.patterns),
        parsed.time_spent_min,
        parsed.struggled ? 1 : 0,
        neetcodeMatch ? 1 : 0,
        neetcodeMatch?.category ?? null
      ).first() as { id: number } | null;

      await this.env.DB.prepare(`
        INSERT INTO daily_activity (user_id, date, problems_solved, total_time_min)
        VALUES (?, ?, 1, ?)
        ON CONFLICT(user_id, date) DO UPDATE SET
          problems_solved = problems_solved + 1,
          total_time_min = total_time_min + excluded.total_time_min
      `).bind(this.userId, today, parsed.time_spent_min || 0).run();

      for (const pattern of parsed.patterns) {
        await this.env.DB.prepare(`
          INSERT INTO pattern_progress (user_id, pattern, solved_count, last_practiced)
          VALUES (?, ?, 1, datetime('now'))
          ON CONFLICT(user_id, pattern) DO UPDATE SET
            solved_count = solved_count + 1,
            last_practiced = datetime('now')
        `).bind(this.userId, pattern).run();
      }

      if (result?.id) {
        await this.scheduleReviews({
          leetcode_id: leetcodeId,
          title: parsed.title,
          difficulty: parsed.difficulty,
          patterns: parsed.patterns,
          struggled: parsed.struggled,
          solvedAt: new Date().toISOString(),
        });
      }

      const patternStr = parsed.patterns.length > 0 ? parsed.patterns.map(titleCase).join(', ') : 'General';

      let response = `✅ Logged: ${parsed.title} (${capitalize(parsed.difficulty)})\n`;
      response += `📚 Pattern: ${patternStr}\n`;
      if (parsed.time_spent_min) {
        response += `⏱️ Time: ${parsed.time_spent_min} min\n`;
      }
      response += `🔔 Review scheduled in 1 day`;

      return response;
    } catch (error) {
      console.error('DB error:', error);
      return "Logged the problem but had trouble updating stats.";
    }
  }

  private async handleReviewsRequest(): Promise<string> {
    const due = this.getDueReviews();
    const upcomingCount = this.reviewQueue.filter(r => !r.completed).length - due.length;

    if (due.length === 0 && upcomingCount === 0) {
      return "No reviews scheduled yet! Every problem you log gets a follow-up review — solve one and I'll take it from there.";
    }

    if (due.length === 0) {
      return `No reviews due right now. You have ${upcomingCount} review${upcomingCount === 1 ? '' : 's'} scheduled for later.`;
    }

    const today = new Date().toISOString().split('T')[0];
    // Struggled problems first, then earliest-solved within each group.
    const sorted = [...due].sort((a, b) => {
      if (a.struggled !== b.struggled) return a.struggled ? -1 : 1;
      return a.solved_on.localeCompare(b.solved_on);
    });

    const maxShown = 5;
    let response = `📋 Due for review today:\n\n`;

    for (const review of sorted.slice(0, maxShown)) {
      const daysAgo = Math.max(0, Math.round((Date.parse(today) - Date.parse(review.solved_on)) / 86400000));
      const agoLabel = daysAgo === 0 ? 'today' : daysAgo === 1 ? '1 day ago' : `${daysAgo} days ago`;
      const difficultyLabel = capitalize(review.difficulty);
      const dot = review.struggled ? '🔴' : '🟡';
      const struggledTag = review.struggled ? ' [struggled]' : '';

      response += `${dot} ${review.title} (${difficultyLabel}) — ${agoLabel}${struggledTag}\n`;
    }

    if (due.length > maxShown) {
      response += `...and ${due.length - maxShown} more\n`;
    }

    response += `\nSay 'reviewed [problem name]' when done.`;

    return response;
  }

  private async handleStatsRequest(): Promise<string> {
    const stats = await this.getUserStats();
    
    if (stats.total_problems === 0) {
      return "No problems logged yet! Tell me when you solve one: 'Solved LC 1 Two Sum, easy, 10 min'";
    }

    const dueReviews = this.getDueReviews().length;

    let response = `📊 Your Progress:\n`;
    response += `✅ Solved: ${stats.total_problems} problems\n`;
    response += `🔥 Streak: ${stats.current_streak} days\n`;
    response += `📚 Patterns: ${stats.patterns.length}\n`;
    response += `⚠️ Reviews due: ${dueReviews}`;

    return response;
  }

  // Catch-all for messages that don't match a specific intent. The actual
  // topic-focus/redirect behavior lives in GENERAL_CHAT_SYSTEM_PROMPT
  // (prompts.ts), passed to the model by chat() in ai.ts.
  private async handleGeneralChat(message: string): Promise<string> {
    const stats = await this.getUserStats();
    const recent = await this.getRecentProblems(5);
    return await chat(this.env, message, stats, recent);
  }

  private async handleRecommendationRequest(): Promise<string> {
    const stats = await this.getUserStats();
    const recent = await this.getRecentProblems(10);
    const patterns = await this.getPatternProgress();

    if (stats.total_problems === 0) {
      return `💡 Practice next:\n1. Two Sum (Easy) — Arrays`;
    }

    const recommendations = await getRecommendations(this.env, stats, recent, patterns);

    if (!recommendations || recommendations.length === 0) {
      return "Couldn't come up with recommendations right now — try again in a bit.";
    }

    let response = `💡 Practice next:\n`;
    recommendations.forEach((rec, i) => {
      response += `${i + 1}. ${rec.title} (${capitalize(rec.difficulty)}) — ${titleCase(rec.pattern)}\n`;
    });

    return response.trimEnd();
  }

  private async handleWeeklySummaryRequest(): Promise<string> {
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const weekAgoStr = weekAgo.toISOString().split('T')[0];

    const weeklyResult = await this.env.DB.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN difficulty = 'easy' THEN 1 ELSE 0 END) as easy,
        SUM(CASE WHEN difficulty = 'medium' THEN 1 ELSE 0 END) as medium,
        SUM(CASE WHEN difficulty = 'hard' THEN 1 ELSE 0 END) as hard,
        SUM(time_spent_min) as total_time
      FROM problems WHERE user_id = ? AND solved_at >= ?
    `).bind(this.userId, weekAgoStr).first();

    const dailyResult = await this.env.DB.prepare(`
      SELECT date, problems_solved, total_time_min
      FROM daily_activity WHERE user_id = ? AND date >= ? ORDER BY date DESC
    `).bind(this.userId, weekAgoStr).all();

    const patternResult = await this.env.DB.prepare(`
      SELECT patterns FROM problems WHERE user_id = ? AND solved_at >= ?
    `).bind(this.userId, weekAgoStr).all();

    const patternCounts: Record<string, number> = {};
    for (const row of patternResult.results || []) {
      const patterns = JSON.parse((row as any).patterns || '[]');
      for (const p of patterns) {
        patternCounts[p] = (patternCounts[p] || 0) + 1;
      }
    }

    return await getWeeklySummary(this.env, weeklyResult, patternCounts, dailyResult.results || []);
  }

  private async handleGetStats(): Promise<Response> {
    const stats = await this.getUserStats();
    const due = this.getDueReviews();
    const pending = this.reviewQueue.filter(r => !r.completed);

    return Response.json({
      ...stats,
      reviews_due: due.length,
      reviews_upcoming: pending.length - due.length,
    });
  }

  private async handleGetNeetCodeProgress(): Promise<Response> {
    const categoryTotals = new Map<string, number>();
    for (const p of NEETCODE_150) {
      categoryTotals.set(p.category, (categoryTotals.get(p.category) || 0) + 1);
    }

    const solvedByCategory = await this.env.DB.prepare(`
      SELECT neetcode_category as category, COUNT(DISTINCT leetcode_id) as solved
      FROM problems
      WHERE user_id = ? AND neetcode = 1 AND neetcode_category IS NOT NULL
      GROUP BY neetcode_category
    `).bind(this.userId).all();

    const solvedMap = new Map<string, number>(
      (solvedByCategory.results || []).map((row: any) => [row.category, row.solved])
    );

    const categories = Array.from(categoryTotals.entries())
      .map(([category, total]) => {
        const solved = Math.min(solvedMap.get(category) || 0, total);
        const status = solved === 0 ? 'not_started' : solved >= total ? 'complete' : 'in_progress';
        return { category, solved, total, status };
      })
      .sort((a, b) => b.solved / b.total - a.solved / a.total || a.category.localeCompare(b.category));

    const totalSolved = categories.reduce((sum, c) => sum + c.solved, 0);

    return Response.json({
      total: NEETCODE_150.length,
      solved: totalSolved,
      categories,
    });
  }

  // Suggests 2-3 unsolved NeetCode 150 problems for each pattern the user
  // has practiced fewer than 3 times, sourced from a fixed pattern → NeetCode
  // category mapping. Patterns with no mapped category, or with no unsolved
  // candidates left, are simply omitted from the response.
  private async handleGetNeedsPractice(): Promise<Response> {
    const DIFFICULTY_ORDER: Record<string, number> = { easy: 0, medium: 1, hard: 2 };

    const patterns = await this.getPatternProgress();
    const weakPatterns = [...patterns]
      .filter(p => p.solved_count < 3)
      .sort((a, b) => a.solved_count - b.solved_count)
      .slice(0, 6);

    const solvedResult = await this.env.DB.prepare(`
      SELECT DISTINCT leetcode_id FROM problems WHERE user_id = ? AND leetcode_id IS NOT NULL
    `).bind(this.userId).all();
    const solvedIds = new Set((solvedResult.results || []).map((row: any) => row.leetcode_id));

    const needsPractice = weakPatterns
      .map(wp => {
        const categories = PATTERN_TO_NEETCODE_CATEGORIES[wp.pattern] || [];
        const problems = NEETCODE_150
          .filter(p => categories.includes(p.category) && !solvedIds.has(p.leetcode_id))
          .sort((a, b) => DIFFICULTY_ORDER[a.difficulty] - DIFFICULTY_ORDER[b.difficulty])
          .slice(0, 3)
          .map(p => ({
            leetcode_id: p.leetcode_id,
            title: p.title,
            difficulty: p.difficulty,
            slug: p.slug,
          }));

        return { pattern: wp.pattern, problems };
      })
      .filter(group => group.problems.length > 0);

    return Response.json({ patterns: needsPractice });
  }

  private async handleGetHistory(): Promise<Response> {
    return Response.json({ messages: this.messages.slice(-50) });
  }

  private async getUserStats(): Promise<UserStats> {
    // re_attempt rows are excluded so totals count unique problems, not
    // every solve attempt. Plain COUNT(*) rather than COUNT(DISTINCT
    // leetcode_id): the dedup check in handleLogProblem already guarantees
    // at most one non-re-attempt row per problem, and COUNT(DISTINCT ...)
    // would silently drop rows where leetcode_id is NULL.
    const totals = await this.env.DB.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN difficulty = 'easy' THEN 1 ELSE 0 END) as easy,
        SUM(CASE WHEN difficulty = 'medium' THEN 1 ELSE 0 END) as medium,
        SUM(CASE WHEN difficulty = 'hard' THEN 1 ELSE 0 END) as hard
      FROM problems
      WHERE user_id = ? AND re_attempt = 0
    `).bind(this.userId).first() as any;

    const patterns = await this.getPatternProgress();
    const streak = await this.calculateStreak();

    const sortedPatterns = [...patterns].sort((a, b) => a.solved_count - b.solved_count);
    const weak = sortedPatterns.filter(p => p.solved_count < 5).map(p => p.pattern).slice(0, 5);
    const strong = sortedPatterns.filter(p => p.solved_count >= 5).map(p => p.pattern).reverse().slice(0, 5);

    return {
      total_problems: totals?.total || 0,
      problems_by_difficulty: {
        easy: totals?.easy || 0,
        medium: totals?.medium || 0,
        hard: totals?.hard || 0
      },
      patterns,
      current_streak: streak.current,
      longest_streak: streak.longest,
      weak_patterns: weak,
      strong_patterns: strong
    };
  }

  private async getPatternProgress(): Promise<PatternProgress[]> {
    const result = await this.env.DB.prepare(`
      SELECT pattern, solved_count, total_problems, last_practiced
      FROM pattern_progress WHERE user_id = ? ORDER BY solved_count DESC
    `).bind(this.userId).all();

    return (result.results || []).map((row: any) => ({
      pattern: row.pattern,
      solved_count: row.solved_count,
      total_problems: row.total_problems || 20,
      last_practiced: row.last_practiced
    }));
  }

  private async getRecentProblems(limit: number): Promise<any[]> {
    const result = await this.env.DB.prepare(`
      SELECT * FROM problems WHERE user_id = ? ORDER BY solved_at DESC LIMIT ?
    `).bind(this.userId, limit).all();
    return result.results || [];
  }

  private async calculateStreak(): Promise<{ current: number; longest: number }> {
    const result = await this.env.DB.prepare(`
      SELECT date FROM daily_activity WHERE user_id = ? AND problems_solved > 0 ORDER BY date DESC
    `).bind(this.userId).all();

    const dates = (result.results || []).map((r: any) => r.date);
    if (dates.length === 0) return { current: 0, longest: 0 };

    let current = 0;
    let longest = 0;
    let tempStreak = 1;
    
    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
    
    if (dates[0] === today || dates[0] === yesterday) {
      current = 1;
      for (let i = 1; i < dates.length; i++) {
        const prevDate = new Date(dates[i - 1]);
        const currDate = new Date(dates[i]);
        const diffDays = (prevDate.getTime() - currDate.getTime()) / 86400000;
        if (diffDays === 1) current++;
        else break;
      }
    }

    for (let i = 1; i < dates.length; i++) {
      const prevDate = new Date(dates[i - 1]);
      const currDate = new Date(dates[i]);
      const diffDays = (prevDate.getTime() - currDate.getTime()) / 86400000;
      if (diffDays === 1) tempStreak++;
      else {
        longest = Math.max(longest, tempStreak);
        tempStreak = 1;
      }
    }
    longest = Math.max(longest, tempStreak, current);

    return { current, longest };
  }

  private handleWebSocket(request: Request): Response {
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    server.accept();

    server.addEventListener('message', async (event) => {
      try {
        const data = JSON.parse(event.data as string);
        if (data.type === 'chat') {
          const fakeRequest = new Request('http://localhost/chat', {
            method: 'POST',
            body: JSON.stringify({ message: data.message })
          });
          const response = await this.handleChat(fakeRequest);
          const result = await response.json();
          server.send(JSON.stringify({ type: 'response', ...result }));
        }
      } catch (error) {
        server.send(JSON.stringify({ type: 'error', message: 'Failed to process message' }));
      }
    });

    return new Response(null, { status: 101, webSocket: client });
  }
}
