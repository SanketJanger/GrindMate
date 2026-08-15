-- Adds NeetCode 150 tracking columns to an existing `problems` table.
-- Only needed for databases created before this migration was added —
-- fresh installs get these columns from schema.sql directly.
-- Run once: this will error with "duplicate column name" if re-run.
ALTER TABLE problems ADD COLUMN neetcode INTEGER DEFAULT 0;
ALTER TABLE problems ADD COLUMN neetcode_category TEXT;
