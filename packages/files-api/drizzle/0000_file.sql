CREATE EXTENSION IF NOT EXISTS "pgcrypto";
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "file" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"project_id" uuid,
	"parent_id" uuid,
	"type" text NOT NULL,
	"name" text NOT NULL,
	"status" text DEFAULT 'ready' NOT NULL,
	"system" boolean DEFAULT false NOT NULL,
	"content" jsonb,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "file_type_check" CHECK ("type" IN ('file', 'folder')),
	CONSTRAINT "file_status_check" CHECK ("status" IN ('pending', 'ready')),
	CONSTRAINT "file_parent_id_file_id_fk" FOREIGN KEY ("parent_id") REFERENCES "file"("id") ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_file_org" ON "file" ("org_id","parent_id") WHERE "project_id" IS NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_file_project" ON "file" ("project_id","parent_id") WHERE "project_id" IS NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_file_system" ON "file" ("org_id") WHERE "system";
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_file_unique_name" ON "file" ("org_id", COALESCE("project_id",'00000000-0000-0000-0000-000000000000'::uuid), COALESCE("parent_id",'00000000-0000-0000-0000-000000000000'::uuid), "system", lower("name"));
