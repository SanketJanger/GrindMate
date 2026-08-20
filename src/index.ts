import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { Env } from './types';
import {
  getGitHubAuthURL,
  getGitHubToken,
  getGitHubUser,
  fetchGitHubPrimaryEmail,
  createSessionToken,
  createGuestSessionToken,
  verifySessionToken,
  getCookie,
  setCookie,
  clearCookie,
} from './auth';
import { fetchLeetCodeProfile, fetchProblemDetails } from './leetcode';
import { sendDailyReminders } from './email';
import { NEETCODE_COMPANIES } from './neetcode';

export { GrindMateAgent } from './agent';

interface AuthEnv extends Env {
  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string;
  SESSION_SECRET: string;
  FRONTEND_URL: string;
}

const app = new Hono<{ Bindings: AuthEnv }>();

app.use('*', cors({
  origin: (origin, c) => {
    const frontendUrl = (c.env as AuthEnv).FRONTEND_URL || 'http://localhost:5173';
    const allowed = [frontendUrl, 'http://localhost:5173', 'http://localhost:5174'];
    return allowed.includes(origin) ? origin : allowed[0];
  },
  allowMethods: ['GET', 'POST', 'OPTIONS'],
  allowHeaders: ['Content-Type'],
  credentials: true,
}));

function getCurrentUser(request: Request, secret: string): string | null {
  const cookieHeader = request.headers.get('Cookie');
  console.log('[auth] Cookie header present:', !!cookieHeader);
  const token = getCookie(request, 'session');
  console.log('[auth] Session token found:', !!token);
  if (!token) return null;
  const userId = verifySessionToken(token, secret);
  console.log('[auth] Verified userId:', userId ?? 'null (token invalid or expired)');
  return userId;
}

app.get('/health', (c) => {
  return c.json({ status: 'ok', service: 'grindmate' });
});

app.get('/api/me', (c) => {
  const userId = getCurrentUser(c.req.raw, c.env.SESSION_SECRET);
  if (!userId) {
    return c.json({ user: null });
  }
  return c.json({ user: { id: userId } });
});

app.get('/auth/login', (c) => {
  const redirectUri = new URL('/auth/callback', c.req.url).toString();
  const authUrl = getGitHubAuthURL(c.env.GITHUB_CLIENT_ID, redirectUri);
  return c.redirect(authUrl);
});

app.get('/auth/callback', async (c) => {
  const code = c.req.query('code');
  if (!code) {
    return c.text('Missing code', 400);
  }

  const token = await getGitHubToken(
    code,
    c.env.GITHUB_CLIENT_ID,
    c.env.GITHUB_CLIENT_SECRET
  );

  if (!token) {
    return c.text('Failed to get token', 400);
  }

  const user = await getGitHubUser(token);
  if (!user) {
    return c.text('Failed to get user', 400);
  }

  console.log('[auth/callback] GitHub username:', user.login);

  // Best-effort: save the email for daily review reminders. The access
  // token only ever exists as this local `token` variable and is discarded
  // when this handler returns — only the resulting email is persisted.
  try {
    const primaryEmail = await fetchGitHubPrimaryEmail(token);
    if (primaryEmail) {
      await c.env.DB.prepare(`
        INSERT INTO user_emails (user_id, email)
        VALUES (?, ?)
        ON CONFLICT(user_id) DO NOTHING
      `).bind(user.login, primaryEmail).run();
    }
  } catch (err) {
    console.error('[auth/callback] Failed to save email for', user.login, err);
  }

  const sessionToken = createSessionToken(user.login, c.env.SESSION_SECRET);
  console.log('[auth/callback] Session token created for:', user.login);

  const frontendUrl = c.env.FRONTEND_URL || 'http://localhost:5173';
  const isSecure = frontendUrl.startsWith('https://');
  console.log('[auth/callback] Setting cookie secure:', isSecure, '| SameSite:', isSecure ? 'None' : 'Lax');

  return new Response(null, {
    status: 302,
    headers: {
      Location: frontendUrl,
      'Set-Cookie': setCookie('session', sessionToken, 604800, isSecure),
    },
  });
});

app.get('/auth/guest', (c) => {
  const sessionToken = createGuestSessionToken(c.env.SESSION_SECRET);

  const frontendUrl = c.env.FRONTEND_URL || 'http://localhost:5173';
  const isSecure = frontendUrl.startsWith('https://');

  return new Response(null, {
    status: 302,
    headers: {
      Location: frontendUrl,
      'Set-Cookie': setCookie('session', sessionToken, 604800, isSecure),
    },
  });
});

app.get('/auth/logout', (c) => {
  const frontendUrl = c.env.FRONTEND_URL || 'http://localhost:5173';
  return new Response(null, {
    status: 302,
    headers: {
      Location: frontendUrl,
      'Set-Cookie': clearCookie('session'),
    },
  });
});

function getAgent(env: AuthEnv, userId: string): DurableObjectStub {
  const id = env.GRINDMATE_AGENT.idFromName(userId);
  return env.GRINDMATE_AGENT.get(id);
}

// DurableObjectId.name is not reliably populated on the DO's own `state.id`
// at runtime, so the agent can't infer the authenticated user from its own
// identity — every internal request must carry it explicitly instead.
function agentRequest(url: string, userId: string, init: RequestInit = {}): Request {
  const headers = new Headers(init.headers);
  headers.set('X-User-Id', userId);
  return new Request(url, { ...init, headers });
}

app.get('/api/leetcode/:username', async (c) => {
  const username = c.req.param('username');
  
  const profile = await fetchLeetCodeProfile(username);
  
  if (!profile) {
    return c.json({ error: 'User not found or LeetCode API error' }, 404);
  }
  
  return c.json(profile);
});

app.post('/api/leetcode/import', async (c) => {
  const userId = getCurrentUser(c.req.raw, c.env.SESSION_SECRET);
  if (!userId) {
    return c.json({ error: 'Not authenticated' }, 401);
  }
  
  try {
    const { username } = await c.req.json();
    
    if (!username) {
      return c.json({ error: 'Username required' }, 400);
    }
    
    const profile = await fetchLeetCodeProfile(username);
    
    if (!profile) {
      return c.json({ error: 'User not found' }, 404);
    }
    
    // Import recent accepted submissions
    const agent = getAgent(c.env, userId);
    let imported = 0;
    
    for (const submission of profile.recentSubmissions.slice(0, 10)) {
      // Fetch problem details for tags
      const details = await fetchProblemDetails(submission.titleSlug);
      
      if (details) {
        // Convert tags to patterns
        const patterns = details.topicTags
          .map(t => t.name.toLowerCase().replace(/ /g, '_'))
          .slice(0, 3);
        
        // Log via agent
        const message = `Solved ${details.title}, ${details.difficulty.toLowerCase()}`;
        
        await agent.fetch(agentRequest('http://agent/import', userId, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: details.title,
            difficulty: details.difficulty.toLowerCase(),
            patterns: patterns,
            timestamp: submission.timestamp,
          })
        }));
        
        imported++;
      }
    }
    
    return c.json({ 
      success: true, 
      imported,
      solved: profile.solved 
    });
    
  } catch (error) {
    console.error('Import error:', error);
    return c.json({ error: 'Import failed' }, 500);
  }
});

app.post('/api/chat', async (c) => {
  try {
    const userId = getCurrentUser(c.req.raw, c.env.SESSION_SECRET);
    if (!userId) {
      return c.json({ error: 'Not authenticated' }, 401);
    }
    const body = await c.req.json();
    const message = body.message;

    if (!message) {
      return c.json({ error: 'Message required' }, 400);
    }

    const agent = getAgent(c.env, userId);
    const response = await agent.fetch(agentRequest('http://agent/chat', userId, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message })
    }));

    const data = await response.json();
    return c.json(data);

  } catch (error) {
    console.error('Chat error:', error);
    return c.json({ error: 'Failed to process chat' }, 500);
  }
});

app.get('/api/stats', async (c) => {
  const userId = getCurrentUser(c.req.raw, c.env.SESSION_SECRET);
  if (!userId) {
    return c.json({ error: 'Not authenticated' }, 401);
  }
  const agent = getAgent(c.env, userId);
  
  const response = await agent.fetch(agentRequest('http://agent/stats', userId));
  const data = await response.json();
  return c.json(data);
});

app.get('/api/neetcode/progress', async (c) => {
  const userId = getCurrentUser(c.req.raw, c.env.SESSION_SECRET);
  if (!userId) {
    return c.json({ error: 'Not authenticated' }, 401);
  }
  const agent = getAgent(c.env, userId);

  const response = await agent.fetch(agentRequest('http://agent/neetcode/progress', userId));
  const data = await response.json();
  return c.json(data);
});

app.get('/api/needs-practice', async (c) => {
  const userId = getCurrentUser(c.req.raw, c.env.SESSION_SECRET);
  if (!userId) {
    return c.json({ error: 'Not authenticated' }, 401);
  }
  const agent = getAgent(c.env, userId);

  const response = await agent.fetch(agentRequest('http://agent/needs-practice', userId));
  const data = await response.json();
  return c.json(data);
});

// Static list, no per-user data needed — served directly rather than
// round-tripping through the Durable Object.
app.get('/api/neetcode/companies', async (c) => {
  const userId = getCurrentUser(c.req.raw, c.env.SESSION_SECRET);
  if (!userId) {
    return c.json({ error: 'Not authenticated' }, 401);
  }
  return c.json({ companies: NEETCODE_COMPANIES });
});

app.get('/api/neetcode/by-company', async (c) => {
  const userId = getCurrentUser(c.req.raw, c.env.SESSION_SECRET);
  if (!userId) {
    return c.json({ error: 'Not authenticated' }, 401);
  }
  const agent = getAgent(c.env, userId);
  const company = c.req.query('company') || '';

  const response = await agent.fetch(agentRequest(
    `http://agent/neetcode/by-company?company=${encodeURIComponent(company)}`,
    userId
  ));
  const data = await response.json();
  return c.json(data, response.status as any);
});

app.get('/api/reviews', async (c) => {
  const userId = getCurrentUser(c.req.raw, c.env.SESSION_SECRET);
  if (!userId) {
    return c.json({ error: 'Not authenticated' }, 401);
  }
  const agent = getAgent(c.env, userId);

  const response = await agent.fetch(agentRequest('http://agent/reviews', userId));
  const data = await response.json();
  return c.json(data);
});

app.post('/api/reviews/complete', async (c) => {
  const userId = getCurrentUser(c.req.raw, c.env.SESSION_SECRET);
  if (!userId) {
    return c.json({ error: 'Not authenticated' }, 401);
  }
  const agent = getAgent(c.env, userId);

  const body = await c.req.text();
  const response = await agent.fetch(agentRequest('http://agent/reviews/complete', userId, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  }));
  const data = await response.json();
  return c.json(data, response.status as any);
});

app.get('/api/history', async (c) => {
  const userId = getCurrentUser(c.req.raw, c.env.SESSION_SECRET);
  if (!userId) {
    return c.json({ error: 'Not authenticated' }, 401);
  }
  const agent = getAgent(c.env, userId);
  
  const response = await agent.fetch(agentRequest('http://agent/history', userId));
  const data = await response.json();
  return c.json(data);
});

app.get('/__scheduled', async (c) => {
  const secret = c.req.query('secret');
  if (secret !== c.env.CRON_SECRET) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  await sendDailyReminders(c.env);
  return c.json({ success: true, message: 'Daily reminders sent' });
});

app.get('*', async (c) => {
  return c.html(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>GrindMate</title>
      <script src="https://cdn.tailwindcss.com"></script>
    </head>
    <body class="bg-gray-900 text-white min-h-screen flex items-center justify-center">
      <div class="text-center">
        <h1 class="text-4xl font-bold mb-4">GrindMate API</h1>
        <p class="text-gray-400 mb-8">Use the frontend at localhost:5173</p>
        <a href="http://localhost:5173" class="bg-blue-600 hover:bg-blue-700 px-6 py-3 rounded-lg">
          Go to App
        </a>
      </div>
    </body>
    </html>
  `);
});

export default {
  fetch: app.fetch,
  async scheduled(controller: ScheduledController, env: AuthEnv, ctx: ExecutionContext) {
    console.log('[cron] Daily review reminder run starting');
    ctx.waitUntil(sendDailyReminders(env));
  },
};
