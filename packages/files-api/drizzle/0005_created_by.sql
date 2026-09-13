-- The column takes its short name back. The value does not change.
--
-- `0004` moved this from the identity subject to the platform's own `user.id`
-- and renamed it to say so. Only the name reverts: a person is always `user.id`
-- and never a subject, which is a rule the schema documents once rather than
-- every column restating it.
--
-- Note that `created_by` held a different kind of id before `0003`. Anything
-- reading this column reads a platform user id; see the comment on the column.

ALTER TABLE "file" RENAME COLUMN "created_by_user_id" TO "created_by";
