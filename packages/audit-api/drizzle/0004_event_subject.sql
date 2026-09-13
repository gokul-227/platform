-- What the event was about, in words, beside the id that already points at it.
--
-- A row said `file` `deleted` and an opaque id, so a reader saw the shape of an
-- event and never its subject: "member standing changed", not "Marius Bauer".
--
-- One column, not three. `resource` and `resource_id` already say what the row
-- is about and how to reach it; only the name was missing, and it has to be
-- stored rather than joined because the row it names is often gone by the time
-- anybody reads the log — a delete is exactly the event whose subject can no
-- longer be looked up.
--
-- The one place `resource_id` did not name the entity a reader cares about was a
-- membership event, where it held the group. It holds the person now, and the
-- group is in `group_id` on every row anyway.
--
-- Nullable, and not backfilled: the rows written before this could only be given
-- a name by guessing one, and a log that guesses is worse than one that admits it
-- was not recorded.

ALTER TABLE "audit_log" ADD COLUMN "resource_label" text;
