/**
 * The layers in front of the free-form endpoint.
 *
 * `assertReadOnlyCypher` is a keyword denylist that matches inside string
 * literals too, accepting false positives to fail closed, and the statement runs
 * in a read-only bolt transaction regardless.
 *
 * `assertScopedCypher` is what makes the endpoint safe rather than merely
 * checked. Every node pattern must carry the `:Scoped` label, which the service
 * substitutes for the labels the caller's partition may read; a pattern this
 * cannot verify is refused rather than fenced on a guess. Filtering results
 * afterwards can never be enough on its own — `MATCH (n) RETURN count(n)` names
 * no partition and returns no entity, so there is nothing left to check by the
 * time the rows come back.
 *
 * `assertEntitiesInScope` stays as defence in depth: it rejects any returned
 * entity whose scope properties do not match, stubs included.
 */
import {
  type CypherQueryResponse,
  PlatformError,
} from "@aec-craft/platform-contracts";
import { scopeLabel } from "../sync/cypher";
import { GraphQueryErrors } from "./graph.query.errors";

const WRITE_CLAUSES = [
  "CREATE",
  "MERGE",
  "DELETE",
  "DETACH",
  "SET",
  "REMOVE",
  "DROP",
  "FOREACH",
  "LOAD CSV",
  "CREATE INDEX",
  "CREATE CONSTRAINT",
  "ALTER",
];

// Built from the static WRITE_CLAUSES list above, not from user input.
const WRITE_PATTERN = new RegExp(
  `\\b(${WRITE_CLAUSES.join("|").replace(/ /g, "\\s+")})\\b`,
  "i"
);

export function assertReadOnlyCypher(query: string): void {
  if (WRITE_PATTERN.test(query)) {
    throw new PlatformError(GraphQueryErrors.CYPHER_NOT_READ_ONLY);
  }
}

export interface CypherScope {
  orgId: string;
  projectId: string;
}

/** The label a caller writes; the server decides what it stands for. */
const SCOPE_PLACEHOLDER = "Scoped";

/**
 * A node pattern rather than a function call, which is the whole difficulty of
 * reading Cypher without a parser: `count(n)` and `(n:Scoped)` are the same
 * three characters otherwise. A `(` directly after an identifier character is a
 * call; one after a space, an arrow or the start of the statement is a pattern.
 */
const NODE_PATTERN =
  /(?<![A-Za-z0-9_])\(\s*[A-Za-z_][A-Za-z0-9_]*\s*(?::[^)]*)?\)/g;

/** The same, for a pattern binding no variable: `()` and `(:Storey)`. */
const ANONYMOUS_PATTERN = /(?<![A-Za-z0-9_])\(\s*(?::[^)]*)?\)/;

/** Anything the caller must not name for itself, because the server owns it. */
const RESERVED_LABEL = /:\s*`?(Scope_|Org_|Project_)/i;

/** `[*]`, `[*1..3]`, `[r*..5]`: a hop through nodes no pattern constrained. */
const VARIABLE_LENGTH = /\[[^\]]*\*[^\]]*\]/;

/**
 * Every node pattern carries `:Scoped`, and nothing else names a scope.
 *
 * This is the fence, and it is written to refuse what it cannot read. A
 * statement whose patterns this does not recognise is rejected, never passed
 * through unfenced: the cost of a false refusal is an error message, the cost of
 * a false accept is another tenant's data. `RETURN (n)` is refused for that
 * reason — a parenthesised expression is indistinguishable from a pattern here.
 *
 * Three things are refused. A node pattern without the placeholder, because an
 * unlabelled node matches the whole projection. A caller-written `Scope_`,
 * `Org_` or `Project_` label, because naming a partition is the server's job.
 * And variable-length traversal, because `(a:Scoped)-[*1..3]-(b:Scoped)` walks
 * through nodes that no pattern constrained, and a path count over them is an
 * existence oracle for rows the caller cannot read.
 */
export function assertScopedCypher(query: string): void {
  if (RESERVED_LABEL.test(query)) {
    throw new PlatformError(GraphQueryErrors.CYPHER_SCOPE_RESERVED);
  }
  if (VARIABLE_LENGTH.test(query)) {
    throw new PlatformError(GraphQueryErrors.CYPHER_VARIABLE_LENGTH);
  }
  const patterns = query.match(NODE_PATTERN) ?? [];
  if (patterns.length === 0 || ANONYMOUS_PATTERN.test(query)) {
    throw new PlatformError(GraphQueryErrors.CYPHER_UNSCOPED);
  }
  for (const pattern of patterns) {
    if (!SCOPED_LABEL.test(pattern)) {
      throw new PlatformError(GraphQueryErrors.CYPHER_UNSCOPED);
    }
  }
}

const SCOPED_LABEL = new RegExp(`:\\s*${SCOPE_PLACEHOLDER}\\b`);

/**
 * `:Scoped` becomes the one label this project's rows carry.
 *
 * One label, not the project and the organization's library together, because a
 * disjunction cannot compose: Memgraph parses `(n:A|B)` but rejects
 * `(n:Storey:A|B)`, `(n:Storey:(A|B))` and `(n:Storey&A)` alike, so a caller
 * naming any label of their own could not also be fenced. The consequence is
 * worth stating plainly on the route: **a Cypher read sees the project's own
 * rows and not the organization's shared library**, which `/objects`, `/rules`
 * and the graph lists all hydrate. It is the safe direction to be wrong in, and
 * a library row is reachable through those.
 */
export function scopedCypher(query: string, scope: CypherScope): string {
  // The projection's own function, not a copy of it: the fence and the writer
  // must produce one string, and a drifted copy fences a query onto a label
  // nothing carries, which reads as an empty result rather than as an error.
  return query.replace(
    new RegExp(`:\\s*${SCOPE_PLACEHOLDER}\\b`, "g"),
    `:${scopeLabel(scope.projectId)}`
  );
}

/** Driver-agnostic duck types for bolt graph values. */
interface NodeLike {
  elementId?: string;
  labels: string[];
  properties: Record<string, unknown>;
}
interface RelationshipLike {
  elementId?: string;
  properties: Record<string, unknown>;
  type: string;
}
interface PathLike {
  segments: {
    start: NodeLike;
    relationship: RelationshipLike;
    end: NodeLike;
  }[];
}
interface IntegerLike {
  inSafeRange: () => boolean;
  toNumber: () => number;
}

/**
 * Map a bolt record value to a JSON-safe shape, collecting every graph
 * entity seen along the way for the scope check.
 */
export function mapBoltValue(
  value: unknown,
  entities: { props: Record<string, unknown> }[]
): unknown {
  if (value === null || value === undefined) {
    return null;
  }
  if (
    typeof value === "string" ||
    typeof value === "boolean" ||
    typeof value === "number"
  ) {
    return value;
  }
  if (isInteger(value)) {
    return value.inSafeRange() ? value.toNumber() : JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return value.map((item) => mapBoltValue(item, entities));
  }
  if (isPath(value)) {
    return {
      type: "path",
      segments: value.segments.map((segment) => ({
        start: mapBoltValue(segment.start, entities),
        relationship: mapBoltValue(segment.relationship, entities),
        end: mapBoltValue(segment.end, entities),
      })),
    };
  }
  if (isNodeLike(value)) {
    entities.push({ props: value.properties });
    return {
      type: "node",
      labels: value.labels,
      properties: mapProperties(value.properties),
    };
  }
  if (isRelationshipLike(value)) {
    entities.push({ props: value.properties });
    return {
      type: "relationship",
      // The relationship's own type, which had the outer key until the
      // discriminator took it. `edgeType` is this domain's word for it.
      edgeType: value.type,
      properties: mapProperties(value.properties),
    };
  }
  if (typeof value === "object") {
    return mapProperties(value as Record<string, unknown>);
  }
  return JSON.stringify(value);
}

export function assertEntitiesInScope(
  entities: { props: Record<string, unknown> }[],
  scope: CypherScope
): void {
  for (const entity of entities) {
    const orgId = entity.props.orgId;
    const projectId = entity.props.projectId ?? null;
    const orgLibrary = orgId === scope.orgId && projectId === null;
    const inProject = orgId === scope.orgId && projectId === scope.projectId;
    if (!(orgLibrary || inProject)) {
      throw new PlatformError(GraphQueryErrors.CYPHER_SCOPE_VIOLATION);
    }
  }
}

export function toCypherResponse(
  records: Record<string, unknown>[],
  truncated: boolean
): CypherQueryResponse {
  return { records, count: records.length, truncated };
}

function mapProperties(
  props: Record<string, unknown>
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(props).map(([k, v]) => [k, mapBoltValue(v, [])])
  );
}

function isInteger(value: unknown): value is IntegerLike {
  const candidate = value as Partial<IntegerLike>;
  return (
    typeof candidate === "object" &&
    candidate !== null &&
    typeof candidate.toNumber === "function" &&
    typeof candidate.inSafeRange === "function"
  );
}

function isNodeLike(value: unknown): value is NodeLike {
  const candidate = value as Partial<NodeLike>;
  return (
    typeof candidate === "object" &&
    candidate !== null &&
    Array.isArray(candidate.labels) &&
    typeof candidate.properties === "object" &&
    candidate.properties !== null
  );
}

function isRelationshipLike(value: unknown): value is RelationshipLike {
  const candidate = value as Partial<RelationshipLike>;
  return (
    typeof candidate === "object" &&
    candidate !== null &&
    typeof candidate.type === "string" &&
    typeof candidate.properties === "object" &&
    candidate.properties !== null
  );
}

function isPath(value: unknown): value is PathLike {
  const candidate = value as Partial<PathLike>;
  return (
    typeof candidate === "object" &&
    candidate !== null &&
    Array.isArray(candidate.segments)
  );
}
