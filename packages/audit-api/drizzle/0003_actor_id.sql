-- The column takes its short name back. The value does not change.
--
-- `0002` moved this from the identity subject to the platform's own `user.id`
-- and renamed it to say so. The name is the part being reverted: `actor_user_id`
-- states in the column what the schema already documents, and every other
-- person-shaped column in the platform reads the same way once you know the
-- rule, which is that a person is always `user.id` and never a subject.
--
-- Nothing about the data moves here. What was backfilled in `0002` stays.

ALTER TABLE "audit_log" RENAME COLUMN "actor_user_id" TO "actor_id";
--> statement-breakpoint
ALTER INDEX IF EXISTS "idx_audit_actor_user" RENAME TO "idx_audit_actor";
