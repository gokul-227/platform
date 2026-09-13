-- A file whose upload is confirmed but whose pipeline is still running is
-- `processing`. It reaches `ready` when nothing is owed, whether the steps
-- succeeded or failed: the bytes are verified either way, and a failure is
-- recorded on the step's own row rather than leaving the file stuck.
--
-- `ready` therefore still means "safe to read", which is what download gates on.
-- The narrower claim it used to make, "nothing further will happen to this file",
-- was never what any caller needed.

ALTER TABLE "file" DROP CONSTRAINT IF EXISTS "file_status_check";
ALTER TABLE "file" ADD CONSTRAINT "file_status_check"
  CHECK ("status" IN ('pending', 'processing', 'ready'));
