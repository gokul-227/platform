ALTER TABLE "file_index_tombstone" ADD COLUMN "figure_keys" jsonb DEFAULT '[]'::jsonb NOT NULL;
