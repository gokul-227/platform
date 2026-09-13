import type { ResolvedScope } from "@aec-craft/platform-contracts";
import { PlatformError } from "@aec-craft/platform-contracts";
import { eq } from "drizzle-orm";
import type { Database } from "../../database/database.module";
import { graphNode } from "../../database/schema";
import { GraphEdgeErrors } from "./graph.edge.errors";

type Executor = Pick<Database, "select">;

/**
 * No self-loops, and both endpoints exist in the changeset's org. An org-scoped
 * edge takes org-scoped endpoints; a project-scoped one takes endpoints in the
 * project or in the parent org's library, which is the common reference bind.
 *
 * Inside a changeset the executor is the open transaction, so a node created
 * earlier in the same call is already a visible endpoint.
 */
export async function assertEndpointsVisible(
  db: Executor,
  scope: ResolvedScope,
  sourceId: string,
  targetId: string
): Promise<void> {
  if (sourceId === targetId) {
    throw new PlatformError(GraphEdgeErrors.SELF_LOOP);
  }
  const [src, tgt] = await Promise.all([
    loadEndpoint(db, sourceId),
    loadEndpoint(db, targetId),
  ]);
  if (!src) {
    throw new PlatformError(GraphEdgeErrors.SOURCE_NOT_FOUND);
  }
  if (!tgt) {
    throw new PlatformError(GraphEdgeErrors.TARGET_NOT_FOUND);
  }

  if (src.orgId !== tgt.orgId || src.orgId !== scope.orgId) {
    throw new PlatformError(GraphEdgeErrors.CROSS_ORG);
  }

  if (scope.projectId == null) {
    if (src.projectId != null) {
      throw new PlatformError(GraphEdgeErrors.SOURCE_NOT_FOUND);
    }
    if (tgt.projectId != null) {
      throw new PlatformError(GraphEdgeErrors.TARGET_NOT_FOUND);
    }
    return;
  }
  if (src.projectId != null && src.projectId !== scope.projectId) {
    throw new PlatformError(GraphEdgeErrors.CROSS_PROJECT);
  }
  if (tgt.projectId != null && tgt.projectId !== scope.projectId) {
    throw new PlatformError(GraphEdgeErrors.CROSS_PROJECT);
  }
}

async function loadEndpoint(db: Executor, nodeId: string) {
  const rows = await db
    .select({
      id: graphNode.id,
      orgId: graphNode.orgId,
      projectId: graphNode.projectId,
    })
    .from(graphNode)
    .where(eq(graphNode.id, nodeId))
    .limit(1);
  return rows[0];
}
