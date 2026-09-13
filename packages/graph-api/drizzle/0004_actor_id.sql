-- The column takes its short name back. The value does not change.
--
-- `0003` moved this from the identity subject to the platform's own `user.id`
-- and renamed it to say so. Only the name reverts, matching `audit_log.actor_id`:
-- a person is always `user.id` and never a subject, documented on the column
-- rather than spelled into it.

ALTER TABLE "graph_version" RENAME COLUMN "actor_user_id" TO "actor_id";
