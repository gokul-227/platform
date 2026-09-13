-- The actor is the subject the gateway asserts, not a platform user id.
--
-- Text, not uuid: a person's subject happens to be a uuid, a service account's
-- is a client id, and the column was silently accepting the first while
-- rejecting the second outright. A machine writing a changeset failed on the
-- insert rather than on anything it could act on.

ALTER TABLE "graph_version" ALTER COLUMN "actor_id" TYPE text USING "actor_id"::text;
--> statement-breakpoint
UPDATE "graph_version" AS v SET "actor_id" = u."external_id"
  FROM "user" AS u
  WHERE u."id"::text = v."actor_id" AND u."external_id" IS NOT NULL;
