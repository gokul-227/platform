CREATE EXTENSION IF NOT EXISTS "pgcrypto";
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "thread" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"project_id" uuid,
	"client_id" text,
	"user_id" uuid NOT NULL,
	"title" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "thread_message" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"thread_id" uuid NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"references" jsonb,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "thread_message_role_check" CHECK ("role" IN ('user', 'assistant', 'system', 'tool')),
	CONSTRAINT "thread_message_thread_id_thread_id_fk" FOREIGN KEY ("thread_id") REFERENCES "thread"("id") ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "thread_run" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"thread_id" uuid NOT NULL,
	"status" text NOT NULL,
	"message_id" uuid,
	"model" text,
	"input_tokens" integer,
	"output_tokens" integer,
	"error" text,
	"client_id" text,
	"user_id" uuid NOT NULL,
	"tier" text,
	"agent_config" jsonb,
	"action" jsonb,
	"resume_input" text,
	"debug" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "thread_run_status_check" CHECK ("status" IN ('queued', 'running', 'streaming', 'requires_action', 'complete', 'failed', 'cancelled')),
	CONSTRAINT "thread_run_tier_check" CHECK ("tier" IN ('fast', 'standard', 'advanced')),
	CONSTRAINT "thread_run_thread_id_thread_id_fk" FOREIGN KEY ("thread_id") REFERENCES "thread"("id") ON DELETE cascade,
	CONSTRAINT "thread_run_message_id_thread_message_id_fk" FOREIGN KEY ("message_id") REFERENCES "thread_message"("id") ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_thread_org" ON "thread" ("org_id","updated_at" DESC) WHERE "project_id" IS NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_thread_project" ON "thread" ("project_id","updated_at" DESC) WHERE "project_id" IS NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_thread_user" ON "thread" ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_thread_client" ON "thread" ("client_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_thread_message_thread" ON "thread_message" ("thread_id","created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_thread_run_thread" ON "thread_run" ("thread_id","created_at" DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_thread_run_active" ON "thread_run" ("status") WHERE "status" IN ('queued', 'running', 'streaming');
