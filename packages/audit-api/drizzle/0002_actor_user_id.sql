-- The actor becomes the platform's own id for the person.
--
-- `actor_id` held the subject the gateway asserted. That subject belongs to the
-- identity provider, so it changes for the same person when the provider does,
-- and a swap would leave every historical row naming an identity nothing
-- claims. The log would lose its actors at once, and unrecoverably: the mapping
-- that could repair it is the very column the swap overwrites. So the backfill
-- runs here, before the cutover.
--
-- Nullable. Null covers a `system` action and a machine, which has a client id
-- and no profile; `actor_type` already says which. A machine's own id gets its
-- own column when there is a machine to name, and there is none today: an agent
-- acts through the person who asked it, on that person's token.
--
-- Still no foreign key. This row has to outlive the account it names: a cascade
-- would erase who acted, and a restraint would refuse the very deletion the log
-- exists to record.
--
-- Rows whose subject no longer maps to a profile (a deleted account) land null.
-- Their `actor_type` still says a person acted, which is all that survived the
-- profile going. `0003` takes the short name back.

ALTER TABLE "audit_log" ADD COLUMN IF NOT EXISTS "actor_user_id" uuid;
--> statement-breakpoint
UPDATE "audit_log" AS a SET "actor_user_id" = u."id"
  FROM "user" AS u
  WHERE u."external_id"::text = a."actor_id"::text AND a."actor_id" IS NOT NULL;
--> statement-breakpoint
ALTER TABLE "audit_log" DROP COLUMN "actor_id";
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_audit_actor_user" ON "audit_log" ("actor_user_id")
  WHERE "actor_user_id" IS NOT NULL;
