ALTER TABLE "file" ADD COLUMN IF NOT EXISTS "external_id" text;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_file_unique_external_id" ON "file" ("org_id", COALESCE("project_id",'00000000-0000-0000-0000-000000000000'::uuid), "external_id") WHERE "external_id" IS NOT NULL;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "file_upload" (
	"file_id" uuid PRIMARY KEY NOT NULL,
	"expected_size" bigint NOT NULL,
	"strategy" text NOT NULL,
	"session_url" text,
	"multipart_upload_id" text,
	"part_size_bytes" bigint,
	"status" text DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "file_upload_strategy_check" CHECK ("strategy" IN ('put', 'resumable', 'multipart')),
	CONSTRAINT "file_upload_status_check" CHECK ("status" IN ('pending', 'completing')),
	CONSTRAINT "file_upload_file_id_file_id_fk" FOREIGN KEY ("file_id") REFERENCES "file"("id") ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_file_upload_expires" ON "file_upload" ("expires_at");
