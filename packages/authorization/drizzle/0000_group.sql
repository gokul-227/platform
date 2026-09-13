CREATE TABLE "group" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"project_id" uuid,
	"parent_id" uuid,
	"type" text NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "group_org_id_slug_key" UNIQUE("org_id","slug"),
	CONSTRAINT "group_type_chk" CHECK ("group"."type" IN ('org', 'project', 'custom')),
	CONSTRAINT "group_root_has_no_parent_chk" CHECK ("group"."type" <> 'org' OR "group"."parent_id" IS NULL)
);
--> statement-breakpoint
ALTER TABLE "group" ADD CONSTRAINT "group_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."group"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_group_org" ON "group" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "idx_group_project" ON "group" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "idx_group_parent" ON "group" USING btree ("parent_id");