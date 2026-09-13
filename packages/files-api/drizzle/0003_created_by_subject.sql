-- Authorship is the subject the gateway asserts, matching every other column
-- that names a person. See graph-api's 0002 for why this cannot stay a uuid.
--
-- The foreign key to `user` goes with it, and that is the point rather than a
-- side effect: it required every author to have a platform profile row, which
-- a service account does not and should not need. `user` is a projection for
-- rendering a name, not the register of who may act.

ALTER TABLE "file" DROP CONSTRAINT IF EXISTS "file_created_by_fkey";
--> statement-breakpoint
ALTER TABLE "file" DROP CONSTRAINT IF EXISTS "file_created_by_user_id_fk";
--> statement-breakpoint
ALTER TABLE "file" ALTER COLUMN "created_by" TYPE text USING "created_by"::text;
--> statement-breakpoint
UPDATE "file" AS f SET "created_by" = u."external_id"
  FROM "user" AS u
  WHERE u."id"::text = f."created_by" AND u."external_id" IS NOT NULL;
