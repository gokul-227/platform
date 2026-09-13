CREATE EXTENSION IF NOT EXISTS "pgcrypto";
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"picture" text,
	"external_id" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_key" UNIQUE ("email")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_user_email" ON "user" ("email");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_user_external_id" ON "user" ("external_id") WHERE "external_id" IS NOT NULL;
--> statement-breakpoint
-- Baselining a database that still carries the retired directory slice's shape.
-- A user row is a profile; what someone may do is a standing on a group, and an
-- operator surface gates on the staff role the identity provider stamps, so a
-- second notion of "admin" in our own database is one that can disagree with it.
ALTER TABLE "user" DROP CONSTRAINT IF EXISTS "user_role_chk";
--> statement-breakpoint
ALTER TABLE "user" DROP COLUMN IF EXISTS "role";
--> statement-breakpoint
-- Keyset cursors round-trip through JS Dates, which hold milliseconds; stored
-- microseconds are unrepresentable there and mis-paginate. Precision 3 makes
-- the database round every write to what the cursor can carry. A no-op on a
-- table this migration just created.
ALTER TABLE "user" ALTER COLUMN "created_at" SET DATA TYPE timestamp (3) with time zone;
--> statement-breakpoint
ALTER TABLE "user" ALTER COLUMN "updated_at" SET DATA TYPE timestamp (3) with time zone;
