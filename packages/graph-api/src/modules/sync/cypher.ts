import {
  CANONICAL_CLASS_ROOTS,
  containmentEdgeFor,
} from "@aec-craft/platform-contracts";

import type { GraphVersionRow } from "../versions/graph.version.service";

/**
 * One `graph_version` row to idempotent Cypher, tolerant of out-of-order
 * delivery. Nodes MERGE on `id` and replace their properties wholesale, so a
 * removed key disappears on the next sync. Edge statements MERGE stub endpoints
 * rather than MATCH, so an edge arriving before its nodes leaves placeholders
 * they later fill. An edge type cannot be altered in Cypher, so an upsert is
 * delete-then-create inside the batch's one bolt transaction, and deletes are
 * DETACH, which also covers edge rows Postgres cascaded without a tombstone.
 *
 * The label scheme is in docs/graph.md. Labels cannot be parameterized, so the
 * strings are sanitized; scope queries read the `projectId` property.
 */

export interface CypherStatement {
  params: Record<string, unknown>;
  text: string;
}

/**
 * Removed before re-add on every upsert. Derived from the canonical list, so a
 * new root cannot enter the vocabulary without its stale label being cleared.
 */
const CLASS_ROOT_LABELS = CANONICAL_CLASS_ROOTS.map(labelFor);

export function toCypherStatements(event: GraphVersionRow): CypherStatement[] {
  if (event.entityType === "node") {
    return event.op === "deleted" ? nodeDelete(event) : nodeUpsert(event);
  }
  return event.op === "deleted" ? edgeDelete(event) : edgeUpsert(event);
}

function nodeUpsert(event: GraphVersionRow): CypherStatement[] {
  const snapshot = requireSnapshot(event);
  const labels = nodeLabels(snapshot, event);
  const props: Record<string, unknown> = {
    id: event.entityId,
    orgId: event.orgId,
    projectId: event.projectId,
    // Without it the projection narrows only to a project, and an aggregate
    // there counts rows in groups the caller cannot read.
    groupId: event.groupId,
    type: snapshot.type,
    class: snapshot.class,
    name: snapshot.name,
    version: event.version,
    phase: snapshot.phase ?? null,
    ...blockProperties(asRecord(snapshot.properties)),
  };

  const statements: CypherStatement[] = [
    {
      text: `MERGE (n:Node {id: $id})
        REMOVE n:${CLASS_ROOT_LABELS.join(":")}
        SET n = $props
        SET n${labels.map((l) => `:\`${l}\``).join("")}`,
      params: { id: event.entityId, props },
    },
  ];

  // `parentId` mirrors as a containment relationship typed by the class root.
  // Marked `fromParentId`, so rewiring never touches an explicit containment
  // edge, and the delete is untyped, so a node arriving under a different tree
  // leaves no old arc behind.
  statements.push({
    text: "MATCH (p)-[r {fromParentId: true}]->(n:Node {id: $id}) DELETE r",
    params: { id: event.entityId },
  });
  const parentId = snapshot.parentId;
  if (typeof parentId === "string" && parentId.length > 0) {
    const containment = relTypeFor(
      containmentEdgeFor(classRootOf(snapshot.class)) ?? "contains"
    );
    statements.push({
      text: `MERGE (p:Node {id: $parentId})
        WITH p MATCH (n:Node {id: $id})
        MERGE (p)-[:\`${containment}\` {fromParentId: true}]->(n)`,
      params: { id: event.entityId, parentId },
    });
  }
  return statements;
}

/** The first dot-segment of a class; "" when there is no class to read. */
function classRootOf(cls: unknown): string {
  return typeof cls === "string" ? (cls.split(".", 1)[0] ?? "") : "";
}

function nodeDelete(event: GraphVersionRow): CypherStatement[] {
  return [
    {
      text: "MATCH (n:Node {id: $id}) DETACH DELETE n",
      params: { id: event.entityId },
    },
  ];
}

function edgeUpsert(event: GraphVersionRow): CypherStatement[] {
  const snapshot = requireSnapshot(event);
  const sourceId = str(snapshot.sourceId);
  const targetId = str(snapshot.targetId);
  const relType = relTypeFor(str(snapshot.type));
  const props: Record<string, unknown> = {
    id: event.entityId,
    orgId: event.orgId,
    projectId: event.projectId,
    groupId: event.groupId,
    type: snapshot.type,
    version: event.version,
    ...blockProperties(asRecord(snapshot.properties)),
  };
  return [
    { text: "MERGE (a:Node {id: $sourceId})", params: { sourceId } },
    { text: "MERGE (b:Node {id: $targetId})", params: { targetId } },
    {
      text: "MATCH (x)-[r]->(y) WHERE r.id = $id DELETE r",
      params: { id: event.entityId },
    },
    {
      text: `MATCH (a:Node {id: $sourceId}) MATCH (b:Node {id: $targetId})
        CREATE (a)-[r:\`${relType}\`]->(b) SET r += $props`,
      params: { sourceId, targetId, props },
    },
  ];
}

function edgeDelete(event: GraphVersionRow): CypherStatement[] {
  return [
    {
      text: "MATCH (x)-[r]->(y) WHERE r.id = $id DELETE r",
      params: { id: event.entityId },
    },
  ];
}

function nodeLabels(
  snapshot: Record<string, unknown>,
  event: GraphVersionRow
): string[] {
  const labels = ["Node"];
  const type = labelFor(str(snapshot.type));
  if (type) {
    labels.push(type);
  }
  const classRoot = labelFor(str(snapshot.class).split(".", 1)[0] ?? "");
  if (classRoot && classRoot !== type) {
    labels.push(classRoot);
  }
  labels.push(`Org_${idLabel(event.orgId)}`);
  if (event.projectId != null) {
    labels.push(`Project_${idLabel(event.projectId)}`);
  }
  // The one label a free-form query is fenced by: it names the partition a
  // reader must hold, which is the project for a project row and the
  // organization for a library one. `Org_` alone could not serve — every
  // sibling project carries it too, so fencing on it would open the tenant.
  labels.push(scopeLabel(event.projectId ?? event.orgId));
  return labels.slice(1); // :Node is written literally in the MERGE pattern
}

/**
 * `Scope_<uuid>`, the label `assertScopedCypher` substitutes into a statement.
 * Exported because the query path builds the same string and the two must agree
 * exactly: a mismatch fences a query onto a label nothing carries, which reads
 * as an empty result rather than as an error.
 */
export function scopeLabel(id: string): string {
  return `Scope_${idLabel(id)}`;
}

/** 'object' -> 'Object'; strips anything outside [A-Za-z0-9_]. */
export function labelFor(raw: string): string {
  const cleaned = raw.replace(/[^A-Za-z0-9_]/g, "");
  return cleaned === ""
    ? ""
    : (cleaned[0]?.toUpperCase() ?? "") + cleaned.slice(1);
}

/** 'serves' -> 'SERVES'; sanitized to [A-Z0-9_]. */
export function relTypeFor(raw: string): string {
  const snake = raw
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .toUpperCase()
    .replace(/[^A-Z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
  return snake === "" ? "RELATES_TO" : snake;
}

/** uuid -> label-safe (dashes to underscores). */
function idLabel(id: string): string {
  return id.replace(/[^A-Za-z0-9_]/g, "_");
}

function requireSnapshot(event: GraphVersionRow): Record<string, unknown> {
  if (event.snapshot == null) {
    throw new Error(
      `graph_version seq=${event.seq} op=${event.op} has no snapshot; cannot project`
    );
  }
  return event.snapshot;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/** Written by the upsert statements; a block in the bag must not overwrite one. */
const RESERVED_KEYS = new Set([
  "id",
  "orgId",
  "projectId",
  "type",
  "class",
  "name",
  "version",
  "phase",
  "parentId",
]);

/**
 * Blocks stay nested maps, so a query reads `n.envelope.areaNet` and `keys(n)`
 * is the block inventory. That commits the projection to Memgraph: Neo4j has no
 * map property values. Reverting to flat keys is a resync, not a migration.
 *
 * Lossy on purpose, since Postgres keeps the full form. Nulls, values below
 * depth 6, blocks that sanitize to empty and keys colliding with the reserved
 * scalars are dropped without error; arrays sanitize per element.
 */
export function blockProperties(
  bag: Record<string, unknown>
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(bag)) {
    if (RESERVED_KEYS.has(key)) {
      continue;
    }
    const cleaned = sanitizeValue(value, 0);
    if (cleaned !== undefined) {
      out[key] = cleaned;
    }
  }
  return out;
}

function sanitizeValue(value: unknown, depth: number): unknown {
  if (depth > 6 || value === null || value === undefined) {
    return;
  }
  if (isScalar(value)) {
    return value;
  }
  if (Array.isArray(value)) {
    const items = value
      .map((entry) => sanitizeValue(entry, depth + 1))
      .filter((entry) => entry !== undefined);
    return items.length > 0 ? items : undefined;
  }
  if (typeof value === "object") {
    const map: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(
      value as Record<string, unknown>
    )) {
      const cleaned = sanitizeValue(entry, depth + 1);
      if (cleaned !== undefined) {
        map[key] = cleaned;
      }
    }
    return Object.keys(map).length > 0 ? map : undefined;
  }
  return;
}

function isScalar(value: unknown): value is string | number | boolean {
  return (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  );
}
