// GrindMate Durable Object Agent
// Handles stateful conversation and database operations

import { Env, Problem, UserStats, PatternProgress, ChatMessage } from './types';
import { chat, parseProblem, detectIntent, getRecommendations, getWeeklySummary } from './ai';

export class GrindMateAgent {
  private state: DurableObjectState;
  private env: Env;
  private messages: ChatMessage[] = [];

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
    
    // Load messages from storage on init
    this.state.blockConcurrencyWhile(async () => {
      const stored = await this.state.storage.get<ChatMessage[]>('messages');
      this.messages = stored || [];
    });
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // Handle WebSocket upgrade for real-time chat
    if (request.headers.get('Upgrade') === 'websocket') {
      return this.handleWebSocket(request);
    }

    // REST API endpoints
    if (url.pathname === '/chat' && request.method === 'POST') {
      return this.handleChat(request);
    }

    if (url.pathname === '/stats' && request.method === 'GET') {
      return this.handleGetStats();
    }

    if (url.pathname === '/history' && request.method === 'GET') {
      return this.handleGetHistory();
    }

    return new Response('Not Found', { status: 404 });
  }

  // Main chat handler
  private async handleChat(request: Request): Promise<Response> {
    try {
      const { message } = await request.json() as { message: string };
      
      if (!message || typeof message !== 'string') {
        return Response.json({ error: 'Message required' }, { status: 400 });
      }

      // Save user message
      const userMsg: ChatMessage = {
        role: 'user',
        content: message,
        timestamp: new Date().toISOString()
      };
      this.messages.push(userMsg);

      // Detect what user wants to do
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
        default:
          // General chat - get stats for context
          const stats = await this.getUserStats();
          const recent = await this.getRecentProblems(5);
          response = await chat(this.env, message, stats, recent);
      }

      // Save assistant response
      const assistantMsg: ChatMessage = {
        role: 'assistant',
        content: response,
        timestamp: new Date().toISOString()
      };
      this.messages.push(assistantMsg);

      // Persist messages (keep last 100)
      const toStore = this.messages.slice(-100);
      await this.state.storage.put('messages', toStore);

      return Response.json({ 
        response,
        intent,
        timestamp: assistantMsg.timestamp
      });

    } catch (error) {
      console.error('Chat error:', error);
      return Response.json({ error: 'Failed to process message' }, { status: 500 });
    }
  }

  // Log a solved problem
  private async handleLogProblem(message: string): Promise<string> {
    const parsed = await parseProblem(this.env, message);
    
    if (!parsed) {
      return "I couldn't parse that problem. Try something like: 'Solved LC 121 Two Sum, easy, took 15 min'";
    }

    // Insert into database
    const today = new Date().toISOString().split('T')[0];
    
    try {
      // Insert problem
      await this.env.DB.prepare(`
        INSERT INTO problems (leetcode_id, title, difficulty, patterns, time_spent_min, struggled, solved_at)
        VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
      `).bind(
        parsed.leetcode_id,
        parsed.title,
        parsed.difficulty,
        JSON.stringify(parsed.patterns),
        parsed.time_spent_min,
        parsed.struggled ? 1 : 0
      ).run();

      // Update daily activity
      await this.env.DB.prepare(`
        INSERT INTO daily_activity (date, problems_solved, total_time_min, patterns_practiced)
        VALUES (?, 1, ?, ?)
        ON CONFLICT(date) DO UPDATE SET
          problems_solved = problems_solved + 1,
          total_time_min = total_time_min + excluded.total_time_min
      `).bind(
        today,
        parsed.time_spent_min || 0,
        JSON.stringify(parsed.patterns)
      ).run();

      // Update pattern progress
      for (const pattern of parsed.patterns) {
        await this.env.DB.prepare(`
          INSERT INTO pattern_progress (pattern, solved_count, last_practiced)
          VALUES (?, 1, datetime('now'))
          ON CONFLICT(pattern) DO UPDATE SET
            solved_count = solved_count + 1,
            last_practiced = datetime('now')
        `).bind(pattern).run();
      }

      // Build response
      const stats = await this.getUserStats();
      const patternStr = parsed.patterns.join(', ') || 'general';
      const timeStr = parsed.time_spent_min ? ` in ${parsed.time_spent_min} min` : '';
      const struggleStr = parsed.struggled ? ' (noted you found it challenging)' : '';
      
      let response = `✅ Logged: **${parsed.title}** (${parsed.difficulty})${timeStr}${struggleStr}\n`;
      response += `📊 Patterns: ${patternStr}\n`;
      response += `🔥 Streak: ${stats.current_streak} days | Total: ${stats.total_problems} problems`;

      return response;

    } catch (error) {
      console.error('DB error:', error);
      return "Logged the problem but had trouble updating stats. It's still saved!";
    }
  }

  // Get user stats
  private async handleStatsRequest(): Promise<string> {
    const stats = await this.getUserStats();
    
    if (stats.total_problems === 0) {
      return "No problems logged yet! Tell me when you solve one, like: 'Solved LC 1 Two Sum, easy, 10 min'";
    }

    let response = `📊 **Your GrindMate Stats**\n\n`;
    response += `**Total:** ${stats.total_problems} problems\n`;
    response += `**By Difficulty:** Easy: ${stats.problems_by_difficulty.easy} | Medium: ${stats.problems_by_difficulty.medium} | Hard: ${stats.problems_by_difficulty.hard}\n`;
    response += `**Streak:** 🔥 ${stats.current_streak} days (best: ${stats.longest_streak})\n\n`;
    
    if (stats.strong_patterns.length > 0) {
      response += `**Strong:** ${stats.strong_patterns.slice(0, 3).join(', ')}\n`;
    }
    if (stats.weak_patterns.length > 0) {
      response += `**Needs Work:** ${stats.weak_patterns.slice(0, 3).join(', ')}\n`;
    }

    return response;
  }

  // Get recommendations
  private async handleRecommendationRequest(): Promise<string> {
    const stats = await this.getUserStats();
    const recent = await this.getRecentProblems(10);
    const patterns = await this.getPatternProgress();

    if (stats.total_problems === 0) {
      return "Start by solving any problem! I recommend LC 1 - Two Sum (Easy, Arrays/Hash Map) as a warm-up.";
    }

    return await getRecommendations(this.env, stats, recent, patterns);
  }

  // Get weekly summary
  private async handleWeeklySummaryRequest(): Promise<string> {
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const weekAgoStr = weekAgo.toISOString().split('T')[0];

    // Get weekly stats
    const weeklyResult = await this.env.DB.prepare(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN difficulty = 'easy' THEN 1 ELSE 0 END) as easy,
        SUM(CASE WHEN difficulty = 'medium' THEN 1 ELSE 0 END) as medium,
        SUM(CASE WHEN difficulty = 'hard' THEN 1 ELSE 0 END) as hard,
        SUM(time_spent_min) as total_time
      FROM problems
      WHERE solved_at >= ?
    `).bind(weekAgoStr).first();

    // Get daily breakdown
    const dailyResult = await this.env.DB.prepare(`
      SELECT date, problems_solved, total_time_min
      FROM daily_activity
      WHERE date >= ?
      ORDER BY date DESC
    `).bind(weekAgoStr).all();

    // Get pattern breakdown for the week
    const patternResult = await this.env.DB.prepare(`
      SELECT patterns FROM problems WHERE solved_at >= ?
    `).bind(weekAgoStr).all();

    // Count patterns
    const patternCounts: Record<string, number> = {};
    for (const row of patternResult.results || []) {
      const patterns = JSON.parse((row as any).patterns || '[]');
      for (const p of patterns) {
        patternCounts[p] = (patternCounts[p] || 0) + 1;
      }
    }

    return await getWeeklySummary(
      this.env,
      weeklyResult,
      patternCounts,
      dailyResult.results || []
    );
  }

  // Handle stats endpoint
  private async handleGetStats(): Promise<Response> {
    const stats = await this.getUserStats();
    return Response.json(stats);
  }

  // Handle history endpoint
  private async handleGetHistory(): Promise<Response> {
    return Response.json({ messages: this.messages.slice(-50) });
  }

  // Helper: Get user stats from DB
  private async getUserStats(): Promise<UserStats> {
    // Total and by difficulty
    const totals = await this.env.DB.prepare(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN difficulty = 'easy' THEN 1 ELSE 0 END) as easy,
        SUM(CASE WHEN difficulty = 'medium' THEN 1 ELSE 0 END) as medium,
        SUM(CASE WHEN difficulty = 'hard' THEN 1 ELSE 0 END) as hard
      FROM problems
    `).first() as any;

    // Pattern progress
    const patterns = await this.getPatternProgress();

    // Calculate streak
    const streak = await this.calculateStreak();

    // Identify weak/strong patterns
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

  // Helper: Get pattern progress
  private async getPatternProgress(): Promise<PatternProgress[]> {
    const result = await this.env.DB.prepare(`
      SELECT pattern, solved_count, total_problems, last_practiced
      FROM pattern_progress
      ORDER BY solved_count DESC
    `).all();

    return (result.results || []).map((row: any) => ({
      pattern: row.pattern,
      solved_count: row.solved_count,
      total_problems: row.total_problems || 20,
      last_practiced: row.last_practiced
    }));
  }

  // Helper: Get recent problems
  private async getRecentProblems(limit: number): Promise<any[]> {
    const result = await this.env.DB.prepare(`
      SELECT * FROM problems
      ORDER BY solved_at DESC
      LIMIT ?
    `).bind(limit).all();

    return result.results || [];
  }

  // Helper: Calculate streak
  private async calculateStreak(): Promise<{ current: number; longest: number }> {
    const result = await this.env.DB.prepare(`
      SELECT date FROM daily_activity
      WHERE problems_solved > 0
      ORDER BY date DESC
    `).all();

    const dates = (result.results || []).map((r: any) => r.date);
    
    if (dates.length === 0) return { current: 0, longest: 0 };

    let current = 0;
    let longest = 0;
    let tempStreak = 1;
    
    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
    
    // Check if streak is active (solved today or yesterday)
    if (dates[0] === today || dates[0] === yesterday) {
      current = 1;
      for (let i = 1; i < dates.length; i++) {
        const prevDate = new Date(dates[i - 1]);
        const currDate = new Date(dates[i]);
        const diffDays = (prevDate.getTime() - currDate.getTime()) / 86400000;
        
        if (diffDays === 1) {
          current++;
        } else {
          break;
        }
      }
    }

    // Calculate longest streak
    for (let i = 1; i < dates.length; i++) {
      const prevDate = new Date(dates[i - 1]);
      const currDate = new Date(dates[i]);
      const diffDays = (prevDate.getTime() - currDate.getTime()) / 86400000;
      
      if (diffDays === 1) {
        tempStreak++;
      } else {
        longest = Math.max(longest, tempStreak);
        tempStreak = 1;
      }
    }
    longest = Math.max(longest, tempStreak, current);

    return { current, longest };
  }

  // WebSocket handler for real-time chat
  private handleWebSocket(request: Request): Response {
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    server.accept();

    server.addEventListener('message', async (event) => {
      try {
        const data = JSON.parse(event.data as string);
        
        if (data.type === 'chat') {
          // Process message same as HTTP
          const fakeRequest = new Request('http://localhost/chat', {
            method: 'POST',
            body: JSON.stringify({ message: data.message })
          });
          
          const response = await this.handleChat(fakeRequest);
          const result = await response.json();
          
          server.send(JSON.stringify({
            type: 'response',
            ...result
          }));
        }
      } catch (error) {
        server.send(JSON.stringify({
          type: 'error',
          message: 'Failed to process message'
        }));
      }
    });

    return new Response(null, { status: 101, webSocket: client });
  }
}
