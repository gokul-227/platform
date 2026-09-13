-- The group index, forward. `0002_group_id` creates it, but databases migrated
-- from an earlier revision of that file do not have it: the file was edited after
-- it had been applied, so the statement never ran on them. Found by the migrate
-- CLI's drift check.
--
-- `IF NOT EXISTS`, so this is a no-op wherever 0002 did create it. The lesson is
-- the general one: a migration that has run is history, and a correction is a new
-- migration rather than an edit.

CREATE INDEX IF NOT EXISTS "idx_file_group" ON "file" USING btree ("group_id");
