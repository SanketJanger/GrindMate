-- GrindMate Database Schema
-- Run: wrangler d1 execute grindmate-db --file=./schema.sql

-- Problems you've solved
CREATE TABLE IF NOT EXISTS problems (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    leetcode_id INTEGER,
    title TEXT NOT NULL,
    difficulty TEXT CHECK(difficulty IN ('easy', 'medium', 'hard')),
    patterns TEXT,  -- JSON array: ["dp", "sliding_window"]
    time_spent_min INTEGER,
    struggled INTEGER DEFAULT 0,  -- 0 = false, 1 = true
    notes TEXT,
    solved_at TEXT DEFAULT (datetime('now')),
    created_at TEXT DEFAULT (datetime('now'))
);

-- Daily activity for streaks
CREATE TABLE IF NOT EXISTS daily_activity (
    date TEXT PRIMARY KEY,  -- "2024-03-15"
    problems_solved INTEGER DEFAULT 0,
    total_time_min INTEGER DEFAULT 0,
    patterns_practiced TEXT  -- JSON array
);

-- Pattern mastery tracking
CREATE TABLE IF NOT EXISTS pattern_progress (
    pattern TEXT PRIMARY KEY,
    solved_count INTEGER DEFAULT 0,
    total_problems INTEGER DEFAULT 20,  -- Estimated problems per pattern
    last_practiced TEXT,
    created_at TEXT DEFAULT (datetime('now'))
);

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_problems_solved_at ON problems(solved_at);
CREATE INDEX IF NOT EXISTS idx_problems_patterns ON problems(patterns);
CREATE INDEX IF NOT EXISTS idx_daily_date ON daily_activity(date);
