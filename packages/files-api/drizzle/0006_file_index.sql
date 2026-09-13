-- The document index: a file's searchable projection, one row per submitted
-- file. A side table rather than columns on `file`, because most rows never
-- come here and `markdown` would otherwise ride along on every tree listing.

CREATE TABLE IF NOT EXISTS "file_index" (
  "file_id" uuid PRIMARY KEY REFERENCES "file"("id") ON DELETE CASCADE,
  "status" text NOT NULL DEFAULT 'pending',
  "error" text,
  "attributes" jsonb,
  "chunking" jsonb,
  "chunk_count" integer,
  "indexed_at" timestamptz,
  "markdown" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "file_index_status_check"
    CHECK ("status" IN ('pending', 'processing', 'indexed', 'failed'))
);

-- The worker's only query: claimable rows, oldest first.
CREATE INDEX IF NOT EXISTS "idx_file_index_pending" ON "file_index" ("updated_at")
  WHERE "status" IN ('pending', 'processing');

-- Vectors owed a deletion, written before the file row disappears and cleared
-- only on a confirmed purge. No FK: the row it refers to is already gone.
CREATE TABLE IF NOT EXISTS "file_index_tombstone" (
  "file_id" uuid PRIMARY KEY,
  "org_id" uuid NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

-- The preset an upload was admitted under, needed at completion to know which
-- pipeline to run. Declared at create, like expected_size.
ALTER TABLE "file_upload"
  ADD COLUMN IF NOT EXISTS "preset" text NOT NULL DEFAULT 'default';
