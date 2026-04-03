import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { Env } from './types';
import {
  getGitHubAuthURL,
  getGitHubToken,
  getGitHubUser,
  createSessionToken,
  verifySessionToken,
  getCookie,
  setCookie,
  clearCookie,
} from './auth';
import { fetchLeetCodeProfile, fetchProblemDetails } from './leetcode';

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
  const token = getCookie(request, 'session');
  if (!token) return null;
  return verifySessionToken(token, secret);
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

  const sessionToken = createSessionToken(user.login, c.env.SESSION_SECRET);
  const frontendUrl = c.env.FRONTEND_URL || 'http://localhost:5173';

  return new Response(null, {
    status: 302,
    headers: {
      Location: frontendUrl,
      'Set-Cookie': setCookie('session', sessionToken),
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

function getAgent(env: AuthEnv, userId: string = 'default'): DurableObjectStub {
  const id = env.GRINDMATE_AGENT.idFromName(userId);
  return env.GRINDMATE_AGENT.get(id);
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
        
        await agent.fetch(new Request('http://agent/import', {
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
    const userId = getCurrentUser(c.req.raw, c.env.SESSION_SECRET) || 'default';
    const body = await c.req.json();
    const message = body.message;

    if (!message) {
      return c.json({ error: 'Message required' }, 400);
    }

    const agent = getAgent(c.env, userId);
    const response = await agent.fetch(new Request('http://agent/chat', {
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
  const userId = getCurrentUser(c.req.raw, c.env.SESSION_SECRET) || 'default';
  const agent = getAgent(c.env, userId);
  
  const response = await agent.fetch(new Request('http://agent/stats'));
  const data = await response.json();
  return c.json(data);
});

app.get('/api/history', async (c) => {
  const userId = getCurrentUser(c.req.raw, c.env.SESSION_SECRET) || 'default';
  const agent = getAgent(c.env, userId);
  
  const response = await agent.fetch(new Request('http://agent/history'));
  const data = await response.json();
  return c.json(data);
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

export default app;
