-- Ownership keys on the subject the gateway asserts, not on a platform user id.
--
-- A thread is a private working surface: the group decides whether you may use
-- threads there at all, and this decides which rows are yours. Keying it on the
-- same value the check path already holds means neither question costs a lookup.
--
-- Text, not uuid: a service account's subject is a client id.

ALTER TABLE "thread" ADD COLUMN IF NOT EXISTS "subject" text;
--> statement-breakpoint
UPDATE "thread" AS t SET "subject" = u."external_id"
  FROM "user" AS u WHERE u."id" = t."user_id" AND t."subject" IS NULL;
--> statement-breakpoint
-- A thread whose owner never came from the identity provider has no subject to
-- move to. Falling back to the old id keeps the column NOT NULL and leaves the
-- row owned by nobody who can sign in, which is the honest outcome.
UPDATE "thread" SET "subject" = "user_id"::text WHERE "subject" IS NULL;
--> statement-breakpoint
ALTER TABLE "thread" ALTER COLUMN "subject" SET NOT NULL;
--> statement-breakpoint
DROP INDEX IF EXISTS "idx_thread_user";
--> statement-breakpoint
ALTER TABLE "thread" DROP COLUMN IF EXISTS "user_id";
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_thread_subject" ON "thread" USING btree ("subject");
--> statement-breakpoint

ALTER TABLE "thread_run" ADD COLUMN IF NOT EXISTS "subject" text;
--> statement-breakpoint
UPDATE "thread_run" AS r SET "subject" = u."external_id"
  FROM "user" AS u WHERE u."id" = r."user_id" AND r."subject" IS NULL;
--> statement-breakpoint
UPDATE "thread_run" SET "subject" = "user_id"::text WHERE "subject" IS NULL;
--> statement-breakpoint
ALTER TABLE "thread_run" ALTER COLUMN "subject" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "thread_run" DROP COLUMN IF EXISTS "user_id";
