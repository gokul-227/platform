-- The version log's actor becomes the platform's own id for the person.
--
-- The companion to `0002`, which moved this to the asserted subject so a
-- machine's client id would fit a column that had been a uuid. Nullable settles
-- that without storing an identity the provider can rewrite underneath us: a
-- swap changes every subject, and the log would lose its actors wholesale.
--
-- Backfilled here, before the cutover, while `user.external_id` still maps.
-- `0004` takes the short name back.

ALTER TABLE "graph_version" ADD COLUMN IF NOT EXISTS "actor_user_id" uuid;
--> statement-breakpoint
UPDATE "graph_version" AS v SET "actor_user_id" = u."id"
  FROM "user" AS u
  WHERE u."external_id"::text = v."actor_id"::text AND v."actor_id" IS NOT NULL;
--> statement-breakpoint
ALTER TABLE "graph_version" DROP COLUMN "actor_id";
