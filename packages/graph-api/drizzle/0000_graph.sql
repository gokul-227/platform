CREATE EXTENSION IF NOT EXISTS "pgcrypto";
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "graph_node" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"project_id" uuid,
	"type" text NOT NULL,
	"class" text NOT NULL,
	"name" text NOT NULL,
	"version" text DEFAULT '1' NOT NULL,
	"parent_id" uuid,
	"phase" text,
	"properties" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"content_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "graph_node_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "graph_node"("id") ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "graph_edge" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"project_id" uuid,
	"source_id" uuid NOT NULL,
	"target_id" uuid NOT NULL,
	"type" text NOT NULL,
	"version" text DEFAULT '1' NOT NULL,
	"properties" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"content_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "graph_edge_no_self_loop_chk" CHECK ("source_id" <> "target_id"),
	CONSTRAINT "graph_edge_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "graph_node"("id") ON DELETE cascade,
	CONSTRAINT "graph_edge_target_id_fkey" FOREIGN KEY ("target_id") REFERENCES "graph_node"("id") ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "graph_version" (
	"seq" bigserial PRIMARY KEY NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"op" text NOT NULL,
	"version" text NOT NULL,
	"org_id" uuid NOT NULL,
	"project_id" uuid,
	"actor_id" uuid,
	"content_hash" text,
	"snapshot" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"synced_at" timestamp with time zone,
	CONSTRAINT "graph_version_entity_type_chk" CHECK ("entity_type" IN ('node', 'edge')),
	CONSTRAINT "graph_version_op_chk" CHECK ("op" IN ('created', 'updated', 'deleted'))
);
--> statement-breakpoint
ALTER TABLE "graph_node" DROP CONSTRAINT IF EXISTS "graph_node_org_id_fkey";
--> statement-breakpoint
ALTER TABLE "graph_node" DROP CONSTRAINT IF EXISTS "graph_node_project_fk";
--> statement-breakpoint
ALTER TABLE "graph_edge" DROP CONSTRAINT IF EXISTS "graph_edge_org_id_fkey";
--> statement-breakpoint
ALTER TABLE "graph_edge" DROP CONSTRAINT IF EXISTS "graph_edge_project_fk";
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_graph_node_org" ON "graph_node" ("org_id", "class") WHERE "project_id" IS NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_graph_node_project" ON "graph_node" ("project_id", "class") WHERE "project_id" IS NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_graph_node_parent" ON "graph_node" ("parent_id") WHERE "parent_id" IS NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_graph_node_properties" ON "graph_node" USING gin ("properties");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_graph_edge_org" ON "graph_edge" ("org_id", "type") WHERE "project_id" IS NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_graph_edge_project" ON "graph_edge" ("project_id", "type") WHERE "project_id" IS NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_graph_edge_source" ON "graph_edge" ("source_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_graph_edge_target" ON "graph_edge" ("target_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_graph_edge_properties" ON "graph_edge" USING gin ("properties");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_graph_version_entity" ON "graph_version" ("entity_type", "entity_id", "seq");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_graph_version_scope" ON "graph_version" ("org_id", "project_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_graph_version_unsynced" ON "graph_version" ("seq") WHERE "synced_at" IS NULL;
