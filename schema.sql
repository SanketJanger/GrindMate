
-- Problems you've solved
CREATE TABLE IF NOT EXISTS problems (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL DEFAULT 'default',
    leetcode_id INTEGER,
    title TEXT NOT NULL,
    difficulty TEXT CHECK(difficulty IN ('easy', 'medium', 'hard')),
    patterns TEXT,
    time_spent_min INTEGER,
    struggled INTEGER DEFAULT 0,
    notes TEXT,
    neetcode INTEGER DEFAULT 0,
    neetcode_category TEXT,
    solved_at TEXT DEFAULT (datetime('now')),
    created_at TEXT DEFAULT (datetime('now'))
);

-- Daily activity for streaks. Keyed per-user: two users solving on the same
-- calendar date must get separate rows, not collide on `date` alone.
CREATE TABLE IF NOT EXISTS daily_activity (
    user_id TEXT NOT NULL DEFAULT 'default',
    date TEXT NOT NULL,
    problems_solved INTEGER DEFAULT 0,
    total_time_min INTEGER DEFAULT 0,
    patterns_practiced TEXT,
    PRIMARY KEY (user_id, date)
);

-- Pattern mastery tracking. Keyed per-user for the same reason.
CREATE TABLE IF NOT EXISTS pattern_progress (
    user_id TEXT NOT NULL DEFAULT 'default',
    pattern TEXT NOT NULL,
    solved_count INTEGER DEFAULT 0,
    total_problems INTEGER DEFAULT 20,
    last_practiced TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    PRIMARY KEY (user_id, pattern)
);

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_problems_solved_at ON problems(solved_at);
CREATE INDEX IF NOT EXISTS idx_problems_patterns ON problems(patterns);
CREATE INDEX IF NOT EXISTS idx_problems_user ON problems(user_id);
CREATE INDEX IF NOT EXISTS idx_daily_date ON daily_activity(date);

-- Spaced repetition reviews
CREATE TABLE IF NOT EXISTS review_queue (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    problem_id INTEGER NOT NULL,
    user_id TEXT NOT NULL,
    scheduled_for TEXT NOT NULL,
    review_number INTEGER DEFAULT 1,
    completed BOOLEAN DEFAULT FALSE,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (problem_id) REFERENCES problems(id)
);

CREATE INDEX IF NOT EXISTS idx_review_scheduled ON review_queue(user_id, scheduled_for, completed);
