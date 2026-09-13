-- The group whose work an event touched. Nullable: an event can predate the
-- tree or sit outside it entirely.
ALTER TABLE "audit_log" ADD COLUMN IF NOT EXISTS "group_id" uuid;
--> statement-breakpoint
-- The actor becomes the subject the gateway asserts: an identity id for a
-- person, a client id for a service. Text rather than uuid so a machine fits,
-- and the existing platform user ids are rewritten to the identity id they
-- mirror so the column means one thing throughout.
ALTER TABLE "audit_log" ALTER COLUMN "actor_id" TYPE text USING "actor_id"::text;
--> statement-breakpoint
UPDATE "audit_log" AS a SET "actor_id" = u."external_id"
  FROM "user" AS u
  WHERE u."id"::text = a."actor_id" AND u."external_id" IS NOT NULL;
--> statement-breakpoint
-- Four actor types collapse to the gateway's two, plus `system` for an action
-- with no caller at all.
UPDATE "audit_log" SET "actor_type" = 'service'
  WHERE "actor_type" IN ('agent', 'service-account');
