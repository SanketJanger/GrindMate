-- Adds the user_emails table for daily review-reminder notifications.
-- Unlike the earlier ALTER TABLE migrations, this is a brand new table, so
-- this file is a plain, safely-repeatable CREATE TABLE IF NOT EXISTS —
-- identical to what schema.sql already defines for fresh installs. Only
-- needed for databases created before this migration was added.
CREATE TABLE IF NOT EXISTS user_emails (
    user_id TEXT PRIMARY KEY,
    email TEXT NOT NULL,
    notify_enabled BOOLEAN DEFAULT TRUE,
    created_at TEXT DEFAULT (datetime('now'))
);
