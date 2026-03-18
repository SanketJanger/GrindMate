// GrindMate - Main Worker Entry Point
// Routes requests to Durable Object Agent

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { Env } from './types';

// Re-export the Durable Object
export { GrindMateAgent } from './agent';

const app = new Hono<{ Bindings: Env }>();

// Enable CORS for frontend
app.use('*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'OPTIONS'],
  allowHeaders: ['Content-Type'],
}));

// Health check
app.get('/health', (c) => {
  return c.json({ status: 'ok', service: 'grindmate' });
});

// Get or create agent for user
function getAgent(env: Env, userId: string = 'default'): DurableObjectStub {
  const id = env.GRINDMATE_AGENT.idFromName(userId);
  return env.GRINDMATE_AGENT.get(id);
}

// Chat endpoint - POST /api/chat
app.post('/api/chat', async (c) => {
  try {
    const body = await c.req.json();
    const userId = body.userId || 'default';
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

// Get stats - GET /api/stats
app.get('/api/stats', async (c) => {
  const userId = c.req.query('userId') || 'default';
  const agent = getAgent(c.env, userId);
  
  const response = await agent.fetch(new Request('http://agent/stats'));
  const data = await response.json();
  return c.json(data);
});

// Get chat history - GET /api/history
app.get('/api/history', async (c) => {
  const userId = c.req.query('userId') || 'default';
  const agent = getAgent(c.env, userId);
  
  const response = await agent.fetch(new Request('http://agent/history'));
  const data = await response.json();
  return c.json(data);
});

// WebSocket upgrade for real-time chat
app.get('/api/ws', async (c) => {
  const upgradeHeader = c.req.header('Upgrade');
  if (upgradeHeader !== 'websocket') {
    return c.text('Expected WebSocket', 400);
  }

  const userId = c.req.query('userId') || 'default';
  const agent = getAgent(c.env, userId);
  
  return agent.fetch(c.req.raw);
});

// Serve static files (frontend) - catch-all
app.get('*', async (c) => {
  // In production, static files are served from the site bucket
  // This is a fallback for the root
  return c.html(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>GrindMate - DSA Practice Companion</title>
      <script src="https://cdn.tailwindcss.com"></script>
      <style>
        .chat-container { height: calc(100vh - 200px); }
        .message-user { background: #3b82f6; color: white; }
        .message-assistant { background: #f3f4f6; color: #1f2937; }
      </style>
    </head>
    <body class="bg-gray-900 text-white">
      <div class="max-w-2xl mx-auto p-4">
        <header class="text-center py-6">
          <h1 class="text-3xl font-bold text-blue-400">🎯 GrindMate</h1>
          <p class="text-gray-400 mt-2">Your AI DSA Practice Companion</p>
        </header>

        <div class="bg-gray-800 rounded-lg shadow-xl">
          <!-- Chat Messages -->
          <div id="chat" class="chat-container overflow-y-auto p-4 space-y-4">
            <div class="message-assistant rounded-lg p-3 max-w-[80%]">
              <p>👋 Hey! I'm GrindMate, your DSA grinding companion.</p>
              <p class="mt-2">Try:</p>
              <ul class="list-disc list-inside mt-1 text-sm">
                <li>"Solved LC 121 Best Time to Buy Stock, easy, 15 min"</li>
                <li>"What should I practice today?"</li>
                <li>"Show my stats"</li>
                <li>"Weekly summary"</li>
              </ul>
            </div>
          </div>

          <!-- Input -->
          <div class="border-t border-gray-700 p-4">
            <form id="chatForm" class="flex gap-2">
              <input 
                type="text" 
                id="messageInput"
                placeholder="Log a problem or ask for help..."
                class="flex-1 bg-gray-700 text-white rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                autocomplete="off"
              >
              <button 
                type="submit"
                class="bg-blue-500 hover:bg-blue-600 px-6 py-2 rounded-lg font-medium transition"
              >
                Send
              </button>
            </form>
          </div>
        </div>

        <footer class="text-center text-gray-500 text-sm mt-4">
          Built on Cloudflare Workers + Workers AI (Llama 3.3)
        </footer>
      </div>

      <script>
        const chat = document.getElementById('chat');
        const form = document.getElementById('chatForm');
        const input = document.getElementById('messageInput');

        function addMessage(content, role) {
          const div = document.createElement('div');
          div.className = \`\${role === 'user' ? 'message-user ml-auto' : 'message-assistant'} rounded-lg p-3 max-w-[80%]\`;
          div.innerHTML = content.replace(/\\*\\*(.*?)\\*\\*/g, '<strong>$1</strong>').replace(/\\n/g, '<br>');
          chat.appendChild(div);
          chat.scrollTop = chat.scrollHeight;
        }

        form.addEventListener('submit', async (e) => {
          e.preventDefault();
          const message = input.value.trim();
          if (!message) return;

          addMessage(message, 'user');
          input.value = '';
          input.disabled = true;

          try {
            const res = await fetch('/api/chat', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ message })
            });
            const data = await res.json();
            addMessage(data.response || data.error || 'No response', 'assistant');
          } catch (err) {
            addMessage('Error: Could not connect to server', 'assistant');
          }

          input.disabled = false;
          input.focus();
        });

        // Load chat history on page load
        fetch('/api/history')
          .then(res => res.json())
          .then(data => {
            if (data.messages && data.messages.length > 0) {
              // Clear welcome message if there's history
              chat.innerHTML = '';
              data.messages.forEach(msg => addMessage(msg.content, msg.role));
            }
          })
          .catch(() => {});
      </script>
    </body>
    </html>
  `);
});

export default app;
