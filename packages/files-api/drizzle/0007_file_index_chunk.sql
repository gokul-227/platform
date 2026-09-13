-- The lexical half of retrieval: one row per chunk of an indexed document.
--
-- Postgres full-text search ranks rows, so chunk-level lexical matching needs
-- chunk-level rows. Ranking whole documents while the semantic side ranks chunks
-- would fuse two different granularities.
--
-- `indexed_text` is the heading-prefixed form, the same string the embedder saw,
-- so a term in a heading counts for the chunks beneath it. `text` is what a hit
-- displays.

CREATE TABLE IF NOT EXISTS "file_index_chunk" (
  "file_id" uuid NOT NULL REFERENCES "file"("id") ON DELETE CASCADE,
  "chunk_index" integer NOT NULL,
  "text" text NOT NULL,
  "indexed_text" text NOT NULL,
  "heading" text,
  "page" integer,
  -- Derived by the database, so it can never disagree with the text it indexes.
  "search_vector" tsvector GENERATED ALWAYS AS (
    to_tsvector('english', "indexed_text")
  ) STORED,
  PRIMARY KEY ("file_id", "chunk_index")
);

CREATE INDEX IF NOT EXISTS "idx_file_index_chunk_search"
  ON "file_index_chunk" USING gin ("search_vector");
