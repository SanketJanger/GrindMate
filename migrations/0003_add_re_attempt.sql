-- Adds re-attempt tracking to an existing `problems` table, so a duplicate
-- log of an already-solved problem can be recorded as a re-attempt instead
-- of silently inserted as a second "first solve" (which double-counted it
-- in stats and could schedule a redundant review chain).
-- Only needed for databases created before this migration was added —
-- fresh installs get this column from schema.sql directly.
-- Run once: this will error with "duplicate column name" if re-run.
ALTER TABLE problems ADD COLUMN re_attempt BOOLEAN DEFAULT FALSE;
