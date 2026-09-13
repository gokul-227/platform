import type { GraphScope } from "@aec-craft/platform-contracts";
import { v5 as uuidv5 } from "uuid";

/**
 * Every id this engine emits is derived, never allocated.
 *
 * Re-reading the same source file produces the same ids, which is what makes a
 * changeset an idempotent upsert with no lookup table and no import history to
 * consult. It is also what lets a re-import pick up improved mapping rules
 * without orphaning the nodes the previous import made.
 *
 * uuidv5 rather than a hash so the output is a real UUID the database can hold
 * in a `uuid` column, and from the `uuid` package rather than `node:crypto` so
 * the engine runs unchanged in a browser.
 */

/**
 * Arbitrary, fixed, and permanent. Any 16 bytes would do; changing these
 * re-keys every node and edge ever imported, which reads to the database as a
 * complete delete and re-create.
 */
const NAMESPACE = "5f4d7c1e-2a3b-4c5d-8e6f-70819a2b3c4d";

/** The tenant component of every derived id: whichever id owns the scope. */
export function scopeKeyOf(scope: GraphScope): string {
  return scope.type === "project" ? scope.projectId : scope.orgId;
}

/**
 * A node's identity: scope, format and the source's own stable id.
 *
 * `format` is in the key because two formats can hand out the same id string
 * for different things, and a project may hold an import from each.
 */
export function nodeId(
  scopeKey: string,
  format: string,
  sourceId: string
): string {
  return uuidv5(`${scopeKey}:${format}:${sourceId}`, NAMESPACE);
}

/**
 * An edge's identity: its endpoints and type.
 *
 * Endpoints are node ids, which are themselves derived, so a re-derived edge
 * lands on the same id without anything having to remember the last one.
 */
export function edgeId(
  scopeKey: string,
  format: string,
  type: string,
  sourceId: string,
  targetId: string
): string {
  return uuidv5(
    `${scopeKey}:${format}:${type}:${sourceId}->${targetId}`,
    NAMESPACE
  );
}
