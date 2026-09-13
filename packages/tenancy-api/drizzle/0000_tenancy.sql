CREATE EXTENSION IF NOT EXISTS "pgcrypto";
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "org" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "org_slug_key" UNIQUE ("slug")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "project" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_org_id_slug_key" UNIQUE ("org_id", "slug"),
	CONSTRAINT "project_id_org_id_key" UNIQUE ("id", "org_id"),
	CONSTRAINT "project_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "org"("id") ON DELETE cascade
);
--> statement-breakpoint
-- The role catalogs and the membership tables go. A standing on a group, held
-- in Keto, replaces all five, and there is no permission catalog to replace
-- `org_role.permissions` with: five standings, five permits.
--
-- `authorization-backfill` reads `org_member` and `project_member` to write the
-- tuples that replace them, so this must not run before it.
DROP TABLE IF EXISTS "org_invite";
--> statement-breakpoint
DROP TABLE IF EXISTS "org_member";
--> statement-breakpoint
DROP TABLE IF EXISTS "project_member";
--> statement-breakpoint
DROP TABLE IF EXISTS "org_role";
--> statement-breakpoint
DROP TABLE IF EXISTS "project_role";
--> statement-breakpoint
-- Keyset cursors round-trip through JS Dates, which hold milliseconds; stored
-- microseconds are unrepresentable there and mis-paginate (asc re-serves the
-- page-one tail row, desc skips rows sharing its millisecond). Precision 3
-- makes the database round every write to what the cursor can carry. No-ops on
-- tables this migration just created.
ALTER TABLE "org" ALTER COLUMN "created_at" SET DATA TYPE timestamp (3) with time zone;
--> statement-breakpoint
ALTER TABLE "org" ALTER COLUMN "updated_at" SET DATA TYPE timestamp (3) with time zone;
--> statement-breakpoint
ALTER TABLE "project" ALTER COLUMN "created_at" SET DATA TYPE timestamp (3) with time zone;
--> statement-breakpoint
ALTER TABLE "project" ALTER COLUMN "updated_at" SET DATA TYPE timestamp (3) with time zone;
