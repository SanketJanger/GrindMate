// GrindMate AI Integration (Workers AI - Llama 3.3)

import { Env, ParsedProblem, UserStats, PatternProgress } from './types';
import { 
  SYSTEM_PROMPT, 
  PARSE_PROBLEM_PROMPT, 
  RECOMMENDATION_PROMPT,
  WEEKLY_SUMMARY_PROMPT,
  CHAT_RESPONSE_PROMPT 
} from './prompts';

// Main chat function - handles all user interactions
export async function chat(
  env: Env,
  userMessage: string,
  stats: UserStats | null,
  recentProblems: any[]
): Promise<string> {
  const prompt = CHAT_RESPONSE_PROMPT
    .replace('{stats}', JSON.stringify(stats, null, 2))
    .replace('{recent}', JSON.stringify(recentProblems.slice(0, 5), null, 2))
    .replace('{message}', userMessage);

  const response = await env.AI.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast', {
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: prompt }
    ],
    max_tokens: 500,
    temperature: 0.7
  });

  return (response as any).response || 'Sorry, I had trouble processing that. Try again?';
}

// Parse a problem from natural language
export async function parseProblem(env: Env, message: string): Promise<ParsedProblem | null> {
  const prompt = PARSE_PROBLEM_PROMPT.replace('{message}', message);

  try {
    const response = await env.AI.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast', {
      messages: [
        { role: 'system', content: 'You are a JSON parser. Return ONLY valid JSON, no explanation.' },
        { role: 'user', content: prompt }
      ],
      max_tokens: 300,
      temperature: 0.1  // Low temperature for consistent parsing
    });

    const text = (response as any).response || '';
    
    // Extract JSON from response (handle markdown code blocks)
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]);
    
    return {
      leetcode_id: parsed.leetcode_id || null,
      title: parsed.title || 'Unknown Problem',
      difficulty: parsed.difficulty || 'medium',
      patterns: Array.isArray(parsed.patterns) ? parsed.patterns : [],
      time_spent_min: parsed.time_spent_min || null,
      struggled: Boolean(parsed.struggled)
    };
  } catch (error) {
    console.error('Failed to parse problem:', error);
    return null;
  }
}

// Generate recommendations based on user's history
export async function getRecommendations(
  env: Env,
  stats: UserStats,
  recentProblems: any[],
  patternProgress: PatternProgress[]
): Promise<string> {
  const prompt = RECOMMENDATION_PROMPT
    .replace('{stats}', JSON.stringify(stats, null, 2))
    .replace('{recent_problems}', JSON.stringify(recentProblems, null, 2))
    .replace('{pattern_progress}', JSON.stringify(patternProgress, null, 2));

  const response = await env.AI.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast', {
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: prompt }
    ],
    max_tokens: 400,
    temperature: 0.7
  });

  return (response as any).response || 'Practice some Dynamic Programming - you haven\'t touched it in a while!';
}

// Generate weekly summary
export async function getWeeklySummary(
  env: Env,
  weeklyStats: any,
  patternBreakdown: any,
  dailyActivity: any[]
): Promise<string> {
  const prompt = WEEKLY_SUMMARY_PROMPT
    .replace('{weekly_stats}', JSON.stringify(weeklyStats, null, 2))
    .replace('{pattern_breakdown}', JSON.stringify(patternBreakdown, null, 2))
    .replace('{daily_activity}', JSON.stringify(dailyActivity, null, 2));

  const response = await env.AI.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast', {
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: prompt }
    ],
    max_tokens: 300,
    temperature: 0.8
  });

  return (response as any).response || 'Keep grinding! Check back after solving more problems for insights.';
}

// Detect intent from user message
export async function detectIntent(env: Env, message: string): Promise<string> {
  const prompt = `Classify this message into ONE category. Return ONLY the category name.

Message: "${message}"

Categories:
- LOG_PROBLEM: User is logging a solved problem (mentions solving, completed, finished, done with a problem)
- GET_STATS: User wants to see their progress/stats
- GET_RECOMMENDATION: User asks what to practice next
- GET_WEEKLY_SUMMARY: User asks for weekly summary/report
- GENERAL_CHAT: Everything else

Return ONLY the category name, nothing else.`;

  const response = await env.AI.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast', {
    messages: [
      { role: 'user', content: prompt }
    ],
    max_tokens: 20,
    temperature: 0.1
  });

  const text = ((response as any).response || 'GENERAL_CHAT').trim().toUpperCase();
  
  // Validate response
  const validIntents = ['LOG_PROBLEM', 'GET_STATS', 'GET_RECOMMENDATION', 'GET_WEEKLY_SUMMARY', 'GENERAL_CHAT'];
  return validIntents.includes(text) ? text : 'GENERAL_CHAT';
}
