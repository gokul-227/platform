-- Every org and every project gets its group, so the tree exists before any
-- other slice can point a `group_id` at it. Reads the directory tables rather
-- than being driven from them: the permissions slice owns `group`, so it seeds
-- it, and a cross-slice read in a one-time backfill is cheaper than a
-- cross-slice write.
--
-- Idempotent on the (org_id, slug) unique key, so re-running baselines rather
-- than duplicating.

INSERT INTO "group" ("org_id", "project_id", "parent_id", "type", "name", "slug")
SELECT o."id", NULL, NULL, 'org', o."name", o."slug"
FROM "org" AS o
ON CONFLICT ("org_id", "slug") DO NOTHING;
--> statement-breakpoint
-- A project's group hangs off its org's root, which is the edge that makes org
-- staff reach every project by default once the parent tuple is written.
INSERT INTO "group" ("org_id", "project_id", "parent_id", "type", "name", "slug")
SELECT p."org_id", p."id", root."id", 'project', p."name", 'project-' || p."slug"
FROM "project" AS p
JOIN "group" AS root ON root."org_id" = p."org_id" AND root."type" = 'org'
ON CONFLICT ("org_id", "slug") DO NOTHING;
