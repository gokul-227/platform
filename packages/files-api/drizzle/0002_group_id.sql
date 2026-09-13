-- The group column. Every check runs against this rather than against
-- (org_id, project_id): ownership cuts across the org/project tree instead of
-- riding it, which is why it needs a column of its own.
ALTER TABLE "file" ADD COLUMN IF NOT EXISTS "group_id" uuid;
--> statement-breakpoint
-- Backfill: a project-scoped row belongs to its project's group, an org-scoped
-- row to the org's root. Both were seeded by the permissions slice, which has
-- to have migrated first.
UPDATE "file" AS t SET "group_id" = g."id"
  FROM "group" AS g
  WHERE g."type" = 'project' AND g."project_id" = t."project_id"
    AND t."project_id" IS NOT NULL AND t."group_id" IS NULL;
--> statement-breakpoint
UPDATE "file" AS t SET "group_id" = g."id"
  FROM "group" AS g
  WHERE g."type" = 'org' AND g."org_id" = t."org_id"
    AND t."project_id" IS NULL AND t."group_id" IS NULL;
--> statement-breakpoint
ALTER TABLE "file" ALTER COLUMN "group_id" SET NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_file_group" ON "file" USING btree ("group_id");
