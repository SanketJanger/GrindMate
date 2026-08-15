import { Env, Problem, UserStats, PatternProgress, ChatMessage } from './types';
import { chat, parseProblem, detectIntent, getRecommendations, getWeeklySummary } from './ai';
import { matchNeetCodeProblem, NEETCODE_150 } from './neetcode';
import { GUEST_USER_ID } from './auth';

interface ReviewItem {
  problemId: number;
  title: string;
  difficulty: string;
  patterns: string[];
  scheduledFor: number;
  reviewNumber: number;
}

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
    const struggledReviewTargets: { problemId: number; title: string; difficulty: string; patterns: string[] }[] = [];

    for (const seed of GUEST_SEED_PROBLEMS) {
      const solvedAt = new Date(now - seed.daysAgo * 24 * 60 * 60 * 1000).toISOString();
      const solvedDate = solvedAt.split('T')[0];

      const result = await this.env.DB.prepare(`
        INSERT INTO problems (user_id, leetcode_id, title, difficulty, patterns, time_spent_min, struggled, solved_at, neetcode, neetcode_category)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        RETURNING id
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
      ).first() as { id: number } | null;

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

      if (seed.struggled && result?.id) {
        struggledReviewTargets.push({
          problemId: result.id,
          title: seed.title,
          difficulty: seed.difficulty,
          patterns: seed.patterns,
        });
      }
    }

    // Backdate 1-2 reviews into the past so they show up as already due,
    // rather than scheduling them forward like a real struggled-problem log would.
    const overdueOffsetsMs = [2 * 24 * 60 * 60 * 1000, 12 * 60 * 60 * 1000];
    for (const [i, target] of struggledReviewTargets.entries()) {
      this.reviewQueue.push({
        problemId: target.problemId,
        title: target.title,
        difficulty: target.difficulty,
        patterns: target.patterns,
        scheduledFor: now - (overdueOffsetsMs[i] ?? 24 * 60 * 60 * 1000),
        reviewNumber: 1,
      });
    }
    await this.state.storage.put('reviewQueue', this.reviewQueue);
  }

  async alarm(): Promise<void> {
    const now = Date.now();
    const dueReviews = this.reviewQueue.filter(r => r.scheduledFor <= now);
    
    if (dueReviews.length > 0) {
      console.log(`${dueReviews.length} reviews are now due`);
    }

    const futureReviews = this.reviewQueue.filter(r => r.scheduledFor > now);
    if (futureReviews.length > 0) {
      const nextReview = Math.min(...futureReviews.map(r => r.scheduledFor));
      await this.state.storage.setAlarm(nextReview);
    }
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

  private async scheduleReviews(problemId: number, title: string, difficulty: string, patterns: string[]): Promise<void> {
    const now = Date.now();
    
    const intervals = [
      1 * 24 * 60 * 60 * 1000,
      3 * 24 * 60 * 60 * 1000,
      7 * 24 * 60 * 60 * 1000,
    ];

    for (let i = 0; i < intervals.length; i++) {
      this.reviewQueue.push({
        problemId,
        title,
        difficulty,
        patterns,
        scheduledFor: now + intervals[i],
        reviewNumber: i + 1,
      });
    }

    await this.state.storage.put('reviewQueue', this.reviewQueue);

    const nextReview = now + intervals[0];
    await this.state.storage.setAlarm(nextReview);
  }

  private async handleGetReviews(): Promise<Response> {
    const now = Date.now();
    const dueReviews = this.reviewQueue.filter(r => r.scheduledFor <= now);
    
    return Response.json({
      due: dueReviews,
      upcoming: this.reviewQueue.filter(r => r.scheduledFor > now).length,
      total: this.reviewQueue.length,
    });
  }

  private async handleCompleteReview(request: Request): Promise<Response> {
    try {
      const { problemId, reviewNumber } = await request.json() as { problemId: number; reviewNumber: number };

      this.reviewQueue = this.reviewQueue.filter(
        r => !(r.problemId === problemId && r.reviewNumber === reviewNumber)
      );
      
      await this.state.storage.put('reviewQueue', this.reviewQueue);
      
      return Response.json({ success: true, remaining: this.reviewQueue.length });
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
          const stats = await this.getUserStats();
          const recent = await this.getRecentProblems(5);
          response = await chat(this.env, message, stats, recent);
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

  private async handleLogProblem(message: string): Promise<string> {
    if (this.isGuest) {
      return `🔒 This is a **read-only demo** — problem logging is disabled so the sample data stays intact for other visitors.\n\nLogin with GitHub to start tracking your own progress: your problems, streaks, and NeetCode 150 progress would be saved just like this demo data.`;
    }

    const parsed = await parseProblem(this.env, message);

    if (!parsed) {
      return "I couldn't parse that problem. Try: 'Solved LC 121 Two Sum, easy, 15 min'";
    }

    const today = new Date().toISOString().split('T')[0];
    const neetcodeMatch = matchNeetCodeProblem(parsed.leetcode_id, parsed.title);
    // Backfill the canonical leetcode_id when the parser couldn't extract one,
    // so NeetCode progress can dedupe reliably by id.
    const leetcodeId = parsed.leetcode_id ?? neetcodeMatch?.leetcode_id ?? null;

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

      if (parsed.struggled && result?.id) {
        await this.scheduleReviews(result.id, parsed.title, parsed.difficulty, parsed.patterns);
      }

      const stats = await this.getUserStats();
      const patternStr = parsed.patterns.join(', ') || 'general';
      const timeStr = parsed.time_spent_min ? ` in ${parsed.time_spent_min} min` : '';
      
      let response = `✅ Logged: **${parsed.title}** (${parsed.difficulty})${timeStr}\n`;
      response += `📊 Patterns: ${patternStr}\n`;
      response += `🔥 Streak: ${stats.current_streak} days | Total: ${stats.total_problems} problems`;

      if (neetcodeMatch) {
        response += `\n🎯 NeetCode 150: ${neetcodeMatch.category}`;
      }
      
      if (parsed.struggled) {
        response += `\n\n📚 I've scheduled review reminders for this problem (1, 3, and 7 days).`;
      }

      return response;
    } catch (error) {
      console.error('DB error:', error);
      return "Logged the problem but had trouble updating stats.";
    }
  }

  private async handleReviewsRequest(): Promise<string> {
    const now = Date.now();
    const dueReviews = this.reviewQueue.filter(r => r.scheduledFor <= now);
    const upcomingCount = this.reviewQueue.filter(r => r.scheduledFor > now).length;

    if (dueReviews.length === 0 && upcomingCount === 0) {
      return "No reviews scheduled! When you log a problem you struggled with, I'll schedule spaced repetition reviews.";
    }

    if (dueReviews.length === 0) {
      return `No reviews due right now. You have ${upcomingCount} reviews scheduled for later.`;
    }

    let response = `📚 **Reviews Due (${dueReviews.length})**\n\n`;
    
    for (const review of dueReviews.slice(0, 5)) {
      const reviewLabel = review.reviewNumber === 1 ? '1st' : review.reviewNumber === 2 ? '2nd' : '3rd';
      response += `• **${review.title}** (${review.difficulty}) - ${reviewLabel} review\n`;
      response += `  Patterns: ${review.patterns.join(', ')}\n\n`;
    }

    if (dueReviews.length > 5) {
      response += `...and ${dueReviews.length - 5} more\n`;
    }

    response += `\nSay "completed [problem name]" after reviewing!`;

    return response;
  }

  private async handleStatsRequest(): Promise<string> {
    const stats = await this.getUserStats();
    
    if (stats.total_problems === 0) {
      return "No problems logged yet! Tell me when you solve one: 'Solved LC 1 Two Sum, easy, 10 min'";
    }

    const now = Date.now();
    const dueReviews = this.reviewQueue.filter(r => r.scheduledFor <= now).length;

    let response = `📊 **Your GrindMate Stats**\n\n`;
    response += `**Total:** ${stats.total_problems} problems\n`;
    response += `**By Difficulty:** Easy: ${stats.problems_by_difficulty.easy} | Medium: ${stats.problems_by_difficulty.medium} | Hard: ${stats.problems_by_difficulty.hard}\n`;
    response += `**Streak:** 🔥 ${stats.current_streak} days (best: ${stats.longest_streak})\n`;
    
    if (dueReviews > 0) {
      response += `**Reviews Due:** 📚 ${dueReviews} problems to review\n`;
    }
    
    response += `\n`;
    
    if (stats.strong_patterns.length > 0) {
      response += `**Strong:** ${stats.strong_patterns.slice(0, 3).join(', ')}\n`;
    }
    if (stats.weak_patterns.length > 0) {
      response += `**Needs Work:** ${stats.weak_patterns.slice(0, 3).join(', ')}\n`;
    }

    return response;
  }

  private async handleRecommendationRequest(): Promise<string> {
    const stats = await this.getUserStats();
    const recent = await this.getRecentProblems(10);
    const patterns = await this.getPatternProgress();

    if (stats.total_problems === 0) {
      return "Start with LC 1 - Two Sum (Easy, Arrays/Hash Map)!";
    }

    return await getRecommendations(this.env, stats, recent, patterns);
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
    const now = Date.now();
    const dueReviews = this.reviewQueue.filter(r => r.scheduledFor <= now);
    
    return Response.json({
      ...stats,
      reviews_due: dueReviews.length,
      reviews_upcoming: this.reviewQueue.length - dueReviews.length,
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

  private async handleGetHistory(): Promise<Response> {
    return Response.json({ messages: this.messages.slice(-50) });
  }

  private async getUserStats(): Promise<UserStats> {
    const totals = await this.env.DB.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN difficulty = 'easy' THEN 1 ELSE 0 END) as easy,
        SUM(CASE WHEN difficulty = 'medium' THEN 1 ELSE 0 END) as medium,
        SUM(CASE WHEN difficulty = 'hard' THEN 1 ELSE 0 END) as hard
      FROM problems
      WHERE user_id = ?
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
