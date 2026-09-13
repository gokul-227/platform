-- The group column. Every check runs against this rather than against
-- (org_id, project_id): ownership cuts across the org/project tree instead of
-- riding it, which is why it needs a column of its own.
ALTER TABLE "graph_node" ADD COLUMN IF NOT EXISTS "group_id" uuid;
--> statement-breakpoint
-- Backfill: a project-scoped row belongs to its project's group, an org-scoped
-- row to the org's root. Both were seeded by the permissions slice, which has
-- to have migrated first.
UPDATE "graph_node" AS t SET "group_id" = g."id"
  FROM "group" AS g
  WHERE g."type" = 'project' AND g."project_id" = t."project_id"
    AND t."project_id" IS NOT NULL AND t."group_id" IS NULL;
--> statement-breakpoint
UPDATE "graph_node" AS t SET "group_id" = g."id"
  FROM "group" AS g
  WHERE g."type" = 'org' AND g."org_id" = t."org_id"
    AND t."project_id" IS NULL AND t."group_id" IS NULL;
--> statement-breakpoint
ALTER TABLE "graph_node" ALTER COLUMN "group_id" SET NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_graph_node_group" ON "graph_node" USING btree ("group_id");
--> statement-breakpoint
-- The group column. Every check runs against this rather than against
-- (org_id, project_id): ownership cuts across the org/project tree instead of
-- riding it, which is why it needs a column of its own.
ALTER TABLE "graph_edge" ADD COLUMN IF NOT EXISTS "group_id" uuid;
--> statement-breakpoint
-- Backfill: a project-scoped row belongs to its project's group, an org-scoped
-- row to the org's root. Both were seeded by the permissions slice, which has
-- to have migrated first.
UPDATE "graph_edge" AS t SET "group_id" = g."id"
  FROM "group" AS g
  WHERE g."type" = 'project' AND g."project_id" = t."project_id"
    AND t."project_id" IS NOT NULL AND t."group_id" IS NULL;
--> statement-breakpoint
UPDATE "graph_edge" AS t SET "group_id" = g."id"
  FROM "group" AS g
  WHERE g."type" = 'org' AND g."org_id" = t."org_id"
    AND t."project_id" IS NULL AND t."group_id" IS NULL;
--> statement-breakpoint
ALTER TABLE "graph_edge" ALTER COLUMN "group_id" SET NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_graph_edge_group" ON "graph_edge" USING btree ("group_id");
--> statement-breakpoint
-- The group column. Every check runs against this rather than against
-- (org_id, project_id): ownership cuts across the org/project tree instead of
-- riding it, which is why it needs a column of its own.
ALTER TABLE "graph_version" ADD COLUMN IF NOT EXISTS "group_id" uuid;
--> statement-breakpoint
-- Backfill: a project-scoped row belongs to its project's group, an org-scoped
-- row to the org's root. Both were seeded by the permissions slice, which has
-- to have migrated first.
UPDATE "graph_version" AS t SET "group_id" = g."id"
  FROM "group" AS g
  WHERE g."type" = 'project' AND g."project_id" = t."project_id"
    AND t."project_id" IS NOT NULL AND t."group_id" IS NULL;
--> statement-breakpoint
UPDATE "graph_version" AS t SET "group_id" = g."id"
  FROM "group" AS g
  WHERE g."type" = 'org' AND g."org_id" = t."org_id"
    AND t."project_id" IS NULL AND t."group_id" IS NULL;
--> statement-breakpoint
ALTER TABLE "graph_version" ALTER COLUMN "group_id" SET NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_graph_version_group" ON "graph_version" USING btree ("group_id");
