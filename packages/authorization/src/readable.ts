import type { Principal } from "@aec-craft/platform-id-resource-nestjs";
import { and, eq, inArray, isNull, or } from "drizzle-orm";
import { memoizePerRequest } from "./cache";
import type { Database } from "./database/database.module";
import { group } from "./database/schema";
import type { KetoClient } from "./keto/keto.client";
import { can } from "./permit";

/**
 * What may they see: the group ids a list query filters on.
 *
 * Candidate sets come from Postgres, verdicts never do — the candidates are a
 * partition's groups, and each one is still asked of Keto. Fan-out is bounded by
 * the group tree (tens), not the rows (millions).
 *
 * A list takes this beside its scope, and the two answer different questions:
 * the partition says which project was asked for, this says which of its rows
 * the caller may see. A row in a restricted folder sits in the project and
 * belongs to somebody else.
 */
export function readableGroups(
  db: Database,
  keto: KetoClient,
  principal: Principal,
  scope: { orgId?: string | null; projectId?: string | null }
): Promise<string[]> {
  const orgId = scope.orgId || null;
  const projectId = scope.projectId || null;
  // An empty scope answers nothing rather than everything.
  if (!(orgId || projectId)) {
    return Promise.resolve([]);
  }
  const key = `readable|${principal.subject}|${orgId ?? ""}|${projectId ?? ""}`;
  return memoizePerRequest(key, async () => {
    // Each id narrows on its own, and an absent one is omitted rather than
    // passed empty: `org_id = ''` reaches a uuid column as a Postgres syntax
    // error, failing the request instead of returning nothing.
    const partition = [
      orgId ? eq(group.orgId, orgId) : undefined,
      projectId
        ? or(eq(group.projectId, projectId), isNull(group.projectId))
        : undefined,
    ].filter((clause) => clause !== undefined);
    const candidates = await db
      .select({ id: group.id })
      .from(group)
      .where(and(...partition));

    const verdicts = await Promise.all(
      candidates.map(async (candidate) => ({
        id: candidate.id,
        allowed: await can(keto, principal, "read", candidate.id),
      }))
    );
    return verdicts.filter((v) => v.allowed).map((v) => v.id);
  });
}

/** The project list. Without `orgId` it spans every tenant the caller can see,
 * which is what an unscoped `GET /projects` means. */
export function readableProjects(
  db: Database,
  keto: KetoClient,
  principal: Principal,
  options: { orgId?: string | undefined } = {}
): Promise<string[]> {
  const key = `readableProjects|${principal.subject}|${options.orgId ?? ""}`;
  return memoizePerRequest(key, async () => {
    const orgIds = options.orgId
      ? [options.orgId]
      : await readableOrgs(db, keto, principal);
    if (orgIds.length === 0) {
      return [];
    }
    const candidates = await db
      .select({ id: group.id, projectId: group.projectId })
      .from(group)
      .where(and(inArray(group.orgId, orgIds), eq(group.type, "project")));

    const verdicts = await Promise.all(
      candidates.map(async (candidate) => ({
        projectId: candidate.projectId,
        allowed: await can(keto, principal, "read", candidate.id),
      }))
    );
    return verdicts.flatMap((v) =>
      v.allowed && v.projectId ? [v.projectId] : []
    );
  });
}

/**
 * The bootstrap list, before any org is chosen: the subject's direct tuples,
 * then their orgs.
 *
 * Direct tuples are enough. A grant's source is another group in the same tenant
 * (cross-tenant grants are refused on the write path), so benefiting from one
 * means holding a standing somewhere in that org already.
 */
export function readableOrgs(
  db: Database,
  keto: KetoClient,
  principal: Principal
): Promise<string[]> {
  return memoizePerRequest(`orgs|${principal.subject}`, async () => {
    const tuples = await keto.list({ subjectId: principal.subject });
    const groupIds = [...new Set(tuples.map((tuple) => tuple.object))];
    if (groupIds.length === 0) {
      return [];
    }
    const rows = await db
      .select({ orgId: group.orgId })
      .from(group)
      .where(inArray(group.id, groupIds));
    return [...new Set(rows.map((row) => row.orgId))];
  });
}
