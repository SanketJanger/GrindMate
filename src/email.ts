import { Env } from './types';
import { GUEST_USER_ID } from './auth';

const RESEND_API_URL = 'https://api.resend.com/emails';
const APP_URL = 'https://grindmate.sanketjanger15.workers.dev';
// TODO: replace with a sending domain verified in your Resend account —
// Resend will reject every send until this is a real, verified domain.
const FROM_ADDRESS = 'GrindMate <onboarding@resend.dev>';

interface DueReviewForEmail {
  title: string;
  difficulty: string;
  review_number: number;
}

const DIFFICULTY_COLORS: Record<string, string> = {
  easy: '#4ade80',
  medium: '#facc15',
  hard: '#f87171',
};

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function emailTemplate(username: string, reviews: DueReviewForEmail[], streak: number): string {
  const items = reviews.map(r => {
    const color = DIFFICULTY_COLORS[r.difficulty] || '#94a3b8';
    const difficultyLabel = r.difficulty.charAt(0).toUpperCase() + r.difficulty.slice(1);
    return `    <li style="margin-bottom: 8px;">${escapeHtml(r.title)} — <span style="color: ${color};">${difficultyLabel}</span> · Review #${r.review_number}</li>`;
  }).join('\n');

  return `<!DOCTYPE html>
<html>
<body style="font-family: sans-serif; background: #0f172a; color: #e2e8f0; padding: 40px;">
  <h1 style="color: #60a5fa;">GrindMate 🎯</h1>
  <p>Hey ${escapeHtml(username)},</p>
  <p>You have <strong>${reviews.length} problem${reviews.length === 1 ? '' : 's'}</strong> due for review today:</p>
  <ul>
${items}
  </ul>
  <p>Your current streak: 🔥 ${streak} days</p>
  <a href="${APP_URL}"
     style="background: #3b82f6; color: white; padding: 12px 24px;
            border-radius: 6px; text-decoration: none;">
    Start Reviewing
  </a>
  <p style="color: #64748b; font-size: 12px; margin-top: 40px;">
    GrindMate • Your DSA Buddy
  </p>
</body>
</html>`;
}

async function sendReviewEmail(
  env: Env,
  email: string,
  username: string,
  dueReviews: DueReviewForEmail[],
  streak: number
): Promise<boolean> {
  const res = await fetch(RESEND_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: FROM_ADDRESS,
      to: email,
      subject: `🔥 You have ${dueReviews.length} problem${dueReviews.length === 1 ? '' : 's'} to review today`,
      html: emailTemplate(username, dueReviews, streak),
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    console.error(`[email] Resend API error for ${username}: ${res.status} ${body}`);
    return false;
  }

  return true;
}

function getAgent(env: Env, userId: string): DurableObjectStub {
  const id = env.GRINDMATE_AGENT.idFromName(userId);
  return env.GRINDMATE_AGENT.get(id);
}

// Every internal DO request is scoped by the X-User-Id header rather than
// the Durable Object's own identity — see agent.ts's fetch() for why
// (DurableObjectId.name isn't reliably populated at runtime).
async function fetchAgentJson(env: Env, userId: string, path: string): Promise<any | null> {
  try {
    const stub = getAgent(env, userId);
    const res = await stub.fetch(new Request(`http://agent${path}`, {
      headers: { 'X-User-Id': userId },
    }));
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    console.error(`[email] Failed to reach agent for ${userId} at ${path}:`, err);
    return null;
  }
}

// D1's problems table has no review-schedule columns — that data lives only
// in each user's own Durable Object storage (see agent.ts's reviewQueue).
// So this can't be a single D1 query as a literal reading of "query D1 for
// users with reviews due" might suggest: it gets candidate user_ids from D1
// (anyone who has ever logged a problem), then asks each user's own DO
// whether they actually have anything due today via the existing /reviews
// endpoint — the only place that knows.
export async function sendDailyReminders(env: Env): Promise<void> {
  const usersResult = await env.DB.prepare(`
    SELECT DISTINCT user_id FROM problems WHERE user_id != ?
  `).bind(GUEST_USER_ID).all();

  const userIds = (usersResult.results || []).map((row: any) => row.user_id as string);
  console.log(`[email] Checking ${userIds.length} user(s) for due reviews`);

  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const userId of userIds) {
    try {
      const reviewsData = await fetchAgentJson(env, userId, '/reviews');
      const due: DueReviewForEmail[] = reviewsData?.due || [];

      if (due.length === 0) {
        skipped++;
        continue;
      }

      const emailRow = await env.DB.prepare(`
        SELECT email FROM user_emails WHERE user_id = ? AND notify_enabled = 1
      `).bind(userId).first() as { email: string } | null;

      if (!emailRow?.email) {
        skipped++;
        continue;
      }

      const statsData = await fetchAgentJson(env, userId, '/stats');
      const streak = statsData?.current_streak || 0;

      const ok = await sendReviewEmail(env, emailRow.email, userId, due, streak);
      if (ok) {
        sent++;
        console.log(`[email] Sent reminder to ${userId} (${due.length} due)`);
      } else {
        failed++;
      }
    } catch (err) {
      failed++;
      console.error(`[email] Failed processing ${userId}:`, err);
    }
  }

  console.log(`[email] Daily reminders complete: ${sent} sent, ${skipped} skipped, ${failed} failed`);
}
