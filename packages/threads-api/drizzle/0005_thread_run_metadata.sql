-- The app metadata bag on the run, same contract as `thread.metadata` and
-- `thread_message.metadata`: free client data the platform stores and never
-- interprets. First consumer: Studio's prompt provenance (PromptSpec).
--
-- NOT NULL DEFAULT '{}' mirrors the other two metadata columns: an absent bag
-- and an empty bag are the same statement here, unlike message `parts`.
ALTER TABLE "thread_run" ADD COLUMN IF NOT EXISTS "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb;
