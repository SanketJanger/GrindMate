# 🎯 GrindMate

**Your AI-powered DSA Practice Companion** — Track LeetCode progress, identify weak patterns, and get personalized recommendations.

Built on Cloudflare Workers, Durable Objects, D1, and Workers AI (Llama 3.3).

![GrindMate Demo](https://via.placeholder.com/800x400?text=GrindMate+Demo)

## ✨ Features

- **📝 Log Problems** — Natural language logging: "Solved LC 121 Two Sum, easy, 15 min"
- **📊 Pattern Tracking** — Automatically categorizes problems (DP, sliding window, graphs, etc.)
- **🎯 Smart Recommendations** — AI suggests what to practice based on your gaps
- **🔥 Streak Tracking** — Stay motivated with daily streaks
- **📈 Weekly Summaries** — Review progress and identify trends
- **💬 Conversational AI** — Chat naturally, powered by Llama 3.3

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Cloudflare Pages                        │
│                      (React Chat UI)                        │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                   Cloudflare Worker                         │
│                    (Hono Router)                            │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                 Durable Object (Agent)                      │
│  • Stateful conversation memory                             │
│  • Intent detection & routing                               │
│  • Database operations                                      │
└──────────────────────────┬──────────────────────────────────┘
                           │
              ┌────────────┴────────────┐
              ▼                         ▼
┌──────────────────────┐    ┌──────────────────────┐
│    D1 Database       │    │   Workers AI         │
│  • Problems log      │    │  • Llama 3.3 70B     │
│  • Pattern progress  │    │  • Intent detection  │
│  • Daily activity    │    │  • Recommendations   │
└──────────────────────┘    └──────────────────────┘
```

## 🚀 Quick Start

### Prerequisites

- Node.js 18+
- Cloudflare account (free tier works)
- Wrangler CLI

### 1. Clone & Install

```bash
git clone https://github.com/YOUR_USERNAME/GrindMate.git
cd GrindMate
npm install
```

### 2. Create D1 Database

```bash
# Create the database
wrangler d1 create grindmate-db

# Copy the database_id from output and update wrangler.toml
```

Update `wrangler.toml` with your database ID:
```toml
[[d1_databases]]
binding = "DB"
database_name = "grindmate-db"
database_id = "YOUR_DATABASE_ID_HERE"  # ← Replace this
```

### 3. Run Database Migrations

```bash
# Local development
npm run db:migrate:local

# Production
npm run db:migrate:prod
```

### 4. Local Development

```bash
npm run dev
```

Visit `http://localhost:8787`

### 5. Deploy to Cloudflare

```bash
npm run deploy
```

## 📖 Usage

### Log a Problem

```
"Solved LC 121 Best Time to Buy Stock, easy, took 15 min"
"Just finished Two Sum, medium difficulty"
"Completed LC 42 Trapping Rain Water - hard, struggled with this one"
```

### Get Recommendations

```
"What should I practice today?"
"Give me a recommendation"
"What patterns am I weak at?"
```

### View Stats

```
"Show my stats"
"How am I doing?"
"Progress report"
```

### Weekly Summary

```
"Weekly summary"
"How was my week?"
"Weekly report"
```

## 🛠️ Tech Stack

| Component | Technology |
|-----------|------------|
| **Runtime** | Cloudflare Workers |
| **State** | Durable Objects |
| **Database** | D1 (SQLite) |
| **AI** | Workers AI (Llama 3.3 70B) |
| **Router** | Hono |
| **Frontend** | Vanilla JS + Tailwind |

## 📊 Database Schema

```sql
-- Problems solved
CREATE TABLE problems (
    id INTEGER PRIMARY KEY,
    leetcode_id INTEGER,
    title TEXT,
    difficulty TEXT,
    patterns TEXT,      -- JSON array
    time_spent_min INTEGER,
    struggled INTEGER,
    solved_at TEXT
);

-- Daily activity (streaks)
CREATE TABLE daily_activity (
    date TEXT PRIMARY KEY,
    problems_solved INTEGER,
    total_time_min INTEGER
);

-- Pattern mastery
CREATE TABLE pattern_progress (
    pattern TEXT PRIMARY KEY,
    solved_count INTEGER,
    last_practiced TEXT
);
```

## 🎯 Patterns Tracked

- Arrays, Strings, Two Pointers, Sliding Window
- Hash Map, Stack, Queue, Linked List
- Binary Search, Sorting, Heap
- Trees, Graphs, BFS, DFS
- Dynamic Programming, Greedy, Backtracking
- Bit Manipulation, Math, Design

## 🔮 Roadmap

- [ ] LeetCode API integration (auto-import solved problems)
- [ ] Spaced repetition reminders
- [ ] Problem difficulty calibration based on your solve times
- [ ] Export progress to CSV/JSON
- [ ] Multi-user support with auth
- [ ] Discord/Slack integration


## 🙏 Acknowledgments

- [Cloudflare Workers](https://workers.cloudflare.com/) — Serverless compute
- [Workers AI](https://developers.cloudflare.com/workers-ai/) — Llama 3.3 inference
- [Hono](https://hono.dev/) — Lightweight web framework
- [LeetCode](https://leetcode.com/) — The grind never stops

---

**Built with ☕ and determination by [Sanket Janger](https://github.com/SanketJanger)**
