CREATE EXTENSION IF NOT EXISTS "pgcrypto";
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid,
	"project_id" uuid,
	"actor_id" uuid,
	"actor_type" text NOT NULL,
	"resource" text NOT NULL,
	"resource_id" uuid,
	"verb" text NOT NULL,
	"context" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"payload" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_log" DROP CONSTRAINT IF EXISTS "audit_log_actor_id_fkey";
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_audit_org" ON "audit_log" ("org_id", "created_at" DESC) WHERE "org_id" IS NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_audit_project" ON "audit_log" ("project_id", "created_at" DESC) WHERE "project_id" IS NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_audit_actor" ON "audit_log" ("actor_id", "created_at" DESC) WHERE "actor_id" IS NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_audit_resource" ON "audit_log" ("resource", "resource_id", "created_at" DESC) WHERE "resource_id" IS NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_audit_verb" ON "audit_log" ("verb", "created_at" DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_audit_context" ON "audit_log" USING gin ("context");
