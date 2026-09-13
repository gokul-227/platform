-- Keyset cursors round-trip through JS Dates, which hold milliseconds; stored
-- microseconds are unrepresentable there and mis-paginate (asc re-serves the
-- page-one tail row, desc skips rows sharing its millisecond). Precision 3
-- makes the database round every write to what the cursor can carry.
--
-- Each statement rewrites its table under ACCESS EXCLUSIVE and rebuilds every
-- index on the column: on a grown table that blocks reads and writes for the
-- duration.
ALTER TABLE "file" ALTER COLUMN "created_at" SET DATA TYPE timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "file" ALTER COLUMN "updated_at" SET DATA TYPE timestamp (3) with time zone;
