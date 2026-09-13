import type { ResolvedScope } from "@aec-craft/platform-contracts";
import { PlatformError } from "@aec-craft/platform-contracts";
import { eq } from "drizzle-orm";
import type { Database } from "../../database/database.module";
import { graphNode } from "../../database/schema";
import { GraphNodeErrors } from "./graph.node.errors";

type Executor = Pick<Database, "select">;

/**
 * An org-scoped node's parent is org-scoped in the same org; a project-scoped
 * node's may be in the same project or org-scoped in its parent org.
 *
 * Inside a changeset the executor is the open transaction, so a parent created
 * earlier in the same call is already visible.
 */
export async function assertParentVisible(
  db: Executor,
  scope: ResolvedScope,
  parentId: string
): Promise<void> {
  const rows = await db
    .select({ orgId: graphNode.orgId, projectId: graphNode.projectId })
    .from(graphNode)
    .where(eq(graphNode.id, parentId))
    .limit(1);
  const parent = rows[0];
  if (!parent) {
    throw new PlatformError(GraphNodeErrors.PARENT_NOT_FOUND);
  }

  if (scope.projectId == null) {
    if (parent.orgId !== scope.orgId || parent.projectId != null) {
      throw new PlatformError(GraphNodeErrors.PARENT_CROSS_SCOPE);
    }
    return;
  }
  const sameProject = parent.projectId === scope.projectId;
  const orgShared = parent.orgId === scope.orgId && parent.projectId == null;
  if (!(sameProject || orgShared)) {
    throw new PlatformError(GraphNodeErrors.PARENT_CROSS_SCOPE);
  }
}

/**
 * Walks the parent chain from `newParentId` up; a hit on `nodeId` means the
 * new pointer would close a cycle. Bounded to 64 hops as a depth guard.
 */
export async function assertNoCycle(
  db: Executor,
  nodeId: string,
  newParentId: string
): Promise<void> {
  let cursor: string | null = newParentId;
  for (let i = 0; i < 64 && cursor != null; i++) {
    if (cursor === nodeId) {
      throw new PlatformError(GraphNodeErrors.PARENT_CYCLE);
    }
    const rows: { parentId: string | null }[] = await db
      .select({ parentId: graphNode.parentId })
      .from(graphNode)
      .where(eq(graphNode.id, cursor))
      .limit(1);
    cursor = rows[0]?.parentId ?? null;
  }
}

/**
 * The root resolves the node's `type`, so re-rooting changes which blocks are
 * valid, which edges may attach and which rules bind, on an id that already
 * carries history. `space` to `space.circulation` refines; `space` to
 * `element.wall` is a different entity wearing an existing id.
 */
export function assertClassRootStable(
  currentClass: string,
  nextClass: string | undefined
): void {
  if (nextClass === undefined) {
    return;
  }
  const currentRoot = currentClass.split(".", 1)[0];
  const nextRoot = nextClass.split(".", 1)[0];
  if (currentRoot !== nextRoot) {
    throw new PlatformError(GraphNodeErrors.CLASS_ROOT_IMMUTABLE);
  }
}
