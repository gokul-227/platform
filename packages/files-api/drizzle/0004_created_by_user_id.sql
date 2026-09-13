-- Authorship becomes the platform's own id for the person.
--
-- `0003` moved this to the asserted subject to stop requiring a profile row,
-- which a machine has never had. Right problem, wrong resting place: the
-- subject belongs to the identity provider, so a swap rewrites it and every row
-- is left naming somebody nothing claims. Nullable does what the foreign key
-- could not, without a key that would erase the author when the account goes.
--
-- Backfilled here, before the cutover, while `user.external_id` still maps.
-- `0005` takes the short name back.

ALTER TABLE "file" ADD COLUMN IF NOT EXISTS "created_by_user_id" uuid;
--> statement-breakpoint
UPDATE "file" AS f SET "created_by_user_id" = u."id"
  FROM "user" AS u
  WHERE u."external_id"::text = f."created_by"::text AND f."created_by" IS NOT NULL;
--> statement-breakpoint
ALTER TABLE "file" DROP COLUMN "created_by";
