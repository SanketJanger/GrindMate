-- Fixes user data isolation: every Durable Object (one per GitHub user) was
-- reading and writing the same shared D1 tables with no per-user scoping,
-- so all users saw each other's problems, streaks, and pattern progress.
-- Only needed for databases created before this migration was added —
-- fresh installs get the correct schema from schema.sql directly.
-- Run once: re-running will error (duplicate column / table already exists).

-- problems: `id` is already the primary key, so a plain column add is safe.
ALTER TABLE problems ADD COLUMN user_id TEXT DEFAULT 'default';
CREATE INDEX IF NOT EXISTS idx_problems_user ON problems(user_id);

-- daily_activity: `date` was the primary key, which would collide across
-- users solving on the same day. Rebuild with a composite (user_id, date)
-- key; existing rows are attributed to 'default'.
ALTER TABLE daily_activity RENAME TO daily_activity_old;

CREATE TABLE daily_activity (
    user_id TEXT NOT NULL DEFAULT 'default',
    date TEXT NOT NULL,
    problems_solved INTEGER DEFAULT 0,
    total_time_min INTEGER DEFAULT 0,
    patterns_practiced TEXT,
    PRIMARY KEY (user_id, date)
);

INSERT INTO daily_activity (user_id, date, problems_solved, total_time_min, patterns_practiced)
SELECT 'default', date, problems_solved, total_time_min, patterns_practiced FROM daily_activity_old;

DROP TABLE daily_activity_old;

CREATE INDEX IF NOT EXISTS idx_daily_date ON daily_activity(date);

-- pattern_progress: `pattern` was the primary key, which would collide
-- across users practicing the same pattern. Same composite-key rebuild.
ALTER TABLE pattern_progress RENAME TO pattern_progress_old;

CREATE TABLE pattern_progress (
    user_id TEXT NOT NULL DEFAULT 'default',
    pattern TEXT NOT NULL,
    solved_count INTEGER DEFAULT 0,
    total_problems INTEGER DEFAULT 20,
    last_practiced TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    PRIMARY KEY (user_id, pattern)
);

INSERT INTO pattern_progress (user_id, pattern, solved_count, total_problems, last_practiced, created_at)
SELECT 'default', pattern, solved_count, total_problems, last_practiced, created_at FROM pattern_progress_old;

DROP TABLE pattern_progress_old;
