# GrindMate

A chat-based tool that helps me track my LeetCode progress while grinding for interviews.

## Why I Built This

I was mass-applying to jobs and doing 3-4 LeetCode problems a day. The problem? I had no system. I'd solve a sliding window problem, then forget about that pattern for two weeks. I'd redo problems I'd already solved because I couldn't remember what I'd done.

So I built GrindMate, a simple chat interface where I log problems as I solve them, and it tracks patterns, identifies weak areas, and tells me what to practice next.

## What It Does

**Log problems naturally:**
```
"Solved LC 1 Two Sum, easy, 10 min"
```

**Track patterns automatically:**
- It figures out that Two Sum is arrays + hash_map
- Keeps count of how many problems I've done per pattern
- Tracks which patterns I haven't touched in a while

**Get recommendations:**
```
"What should I practice today?"
→ "You haven't done DP in 9 days. Try LC 70 Climbing Stairs."
```

**See progress:**
```
"Show my stats"
→ Total: 23 problems | Streak: 5 days | Weak: DP, Graphs
```

## Tech Stack

- **Cloudflare Workers** — Serverless backend
- **Durable Objects** — Persistent chat state per user
- **D1** — SQLite database for problem logs
- **Workers AI** — Llama 3.3 for natural language parsing

## Run Locally

```bash
git clone https://github.com/SanketJanger/GrindMate.git
cd GrindMate
npm install

# Create D1 database
wrangler d1 create grindmate-db
# Update wrangler.toml with your database_id

# Run migrations
wrangler d1 execute grindmate-db --local --file=./schema.sql

# Start dev server
npx wrangler dev --remote
```

## Project Structure

```
src/
├── index.ts      # API routes
├── agent.ts      # Durable Object (handles chat + state)
├── ai.ts         # Workers AI integration
├── prompts.ts    # LLM prompts for parsing
└── types.ts      # TypeScript types

schema.sql        # Database tables
wrangler.toml     # Cloudflare config
```

## Live Demo

https://grindmate.sanketjanger.workers.dev

---

## What's Next

Things I'm planning to add when I have time:

- **Dashboard with charts** — Visual progress tracking, pattern heatmaps, streak calendar
- **GitHub/Google login** — So I can use it across devices
- **LeetCode sync** — Auto-import solved problems instead of typing them manually
- **Spaced repetition** — "Hey, you struggled with this DP problem 2 weeks ago. Try it again."
- **Daily digest** — Morning notification with what to practice today
- **Contest tracking** — Log weekly contest performance and rating changes


Built during my job search grind. If you're also grinding, good luck, we're all gonna make it.
