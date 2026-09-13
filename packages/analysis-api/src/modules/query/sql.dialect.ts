import type { Predicate, QuerySpec } from "@aec-craft/platform-contracts";
import type { AnalysisScope } from "../analysis.scope";
import type { QueryParam } from "./sql.cell";

/**
 * Where a path lives: six fields are columns of the identity core, everything
 * else is a key in the properties bag, and one compiles to `n.class` while the
 * other compiles to a jsonb extraction.
 */
const IDENTITY_COLUMNS: Record<string, string> = {
  class: "class",
  id: "id",
  name: "name",
  parentId: "parent_id",
  type: "type",
  version: "version",
};

/** Prefixes that reach off the subject node. A dialect supports what it can join. */
const CONTEXT_PREFIXES = new Set([
  "parent",
  "project",
  "intent",
  "site",
  "building",
  "storey",
  "space",
]);

interface ResolvedPath {
  /** The column, when the path is part of the identity core. */
  column?: string;
  /** True for the `@edge[class].path` form: one hop, and it needs an aggregate. */
  hop?: boolean;
  /** The path within `properties`, when it is not a column. */
  keys: string[];
  /** The prefix that reached off the subject node, if any. */
  through?: string;
}

/**
 * Split a spec path into what a dialect has to compile.
 *
 * A context prefix is reported rather than resolved: the dialect decides whether
 * it can reach that far and refuses if it cannot. Treating `parent.name` as a
 * property called "parent" would answer a different question without saying so.
 */
function resolvePath(path: string): ResolvedPath {
  // `@bounds[element.wall].envelope.height` is part of the path grammar. Neither
  // dialect compiles one yet, and reporting it is what lets them refuse rather
  // than reading it as a property whose name begins with an at sign.
  if (path.startsWith("@")) {
    return { hop: true, keys: [path] };
  }
  const segments = path.split(".");
  const head = segments[0];
  if (head && CONTEXT_PREFIXES.has(head) && segments.length > 1) {
    return { ...resolveLocal(segments.slice(1)), through: head };
  }
  return resolveLocal(segments);
}

function resolveLocal(segments: string[]): ResolvedPath {
  const head = segments[0];
  const column = head ? IDENTITY_COLUMNS[head] : undefined;
  if (segments.length === 1 && column) {
    return { column, keys: [] };
  }
  return { keys: segments };
}

/** Grows the ordered parameter list Postgres binds positionally. */
class Params {
  readonly values: QueryParam[] = [];

  bind(value: QueryParam): string {
    this.values.push(value);
    return `$${this.values.length}`;
  }
}

/** The operator vocabulary is open by contract, so this is a set of strings and
 *  anything outside it falls to the switch, which refuses. */
const NUMERIC_OPERATORS = new Set(["gte", "gt", "lte", "lt"]);

/** Parameterised SQL, ready for the pool to bind positionally. */
export interface SqlQuery {
  params: QueryParam[];
  text: string;
}

export interface SqlDialect {
  compile(spec: QuerySpec): SqlQuery;
}

export function createSqlDialect(scope: AnalysisScope): SqlDialect {
  return { compile: (spec) => compile(spec, scope) };
}

function compile(spec: QuerySpec, scope: AnalysisScope): SqlQuery {
  const params = new Params();
  const where = [scopeOf(scope, params, "n")];

  if (spec.select.class) {
    where.push(classOf(spec.select.class, params, "n"));
  }
  for (const predicate of spec.select.where ?? []) {
    where.push(predicateOf(predicate, params, "n"));
  }

  const joins: string[] = [];
  let group: string | null = null;

  if (spec.groupBy?.by === "field") {
    group = textOf(spec.groupBy.field, "n");
  }
  if (spec.groupBy?.by === "relation") {
    const { direction, edge, groupClass, label } = spec.groupBy;
    // `in` means the group node points at the selected node, which is how
    // "per storey" reads: the storey contains the space.
    const [near, far] =
      direction === "in"
        ? ["e.target_id = n.id", "e.source_id = g.id"]
        : ["e.source_id = n.id", "e.target_id = g.id"];
    joins.push(
      `JOIN graph_edge e ON ${near} AND e.type = ${params.bind(edge)}`,
      `JOIN graph_node g ON ${far}`
    );
    // The edge and the far node are rows too, and a caller who may not read them
    // may not group by them either.
    where.push(scopeOf(scope, params, "e"), scopeOf(scope, params, "g"));
    if (groupClass) {
      where.push(classOf({ match: "prefix", value: groupClass }, params, "g"));
    }
    group = label === "id" ? "g.id::text" : "g.name";
  }

  const value = aggregateOf(spec);
  const select = group
    ? `SELECT ${group} AS "group", ${value} AS value`
    : `SELECT ${value} AS value`;
  const tail = group ? ` GROUP BY ${group} ORDER BY value DESC NULLS LAST` : "";

  return {
    params: params.values,
    text: `${select} FROM graph_node n${joins.length ? ` ${joins.join(" ")}` : ""} WHERE ${where.join(" AND ")}${tail}`,
  };
}

/**
 * One scope predicate per table. `= ANY($n)` rather than a rendered `IN (...)`,
 * so the group list is bound and cannot be built into the text.
 *
 * Strict where a list read is visible-scoped and also sees the org library: an
 * analysis is about one building. The two agree today, and this one needs no org
 * id and so no second lookup.
 * TODO(#230): one implementation, once the dialect emits drizzle SQL.
 */
function scopeOf(scope: AnalysisScope, params: Params, alias: string): string {
  const partition = `${alias}.project_id = ${params.bind(scope.projectId)}`;
  // An empty readable set matches nothing: `= ANY('{}')` is false, which is the
  // right answer for a caller who may read none of the partition.
  return `(${partition} AND ${alias}.group_id = ANY(${params.bind([...scope.readableGroups])}::uuid[]))`;
}

/**
 * A class root matches itself and its refinements, and the dot is what keeps
 * that honest: `space` must not match `spaceship`.
 */
function classOf(
  match: { match: "prefix" | "exact"; value: string },
  params: Params,
  alias: string
): string {
  const bound = params.bind(match.value);
  if (match.match === "exact") {
    return `${alias}.class = ${bound}`;
  }
  return `(${alias}.class = ${bound} OR ${alias}.class LIKE ${bound} || '.%')`;
}

/**
 * A path becomes either a column or a jsonb extraction. The path is built into
 * the text because neither store binds a path as a parameter; that is safe only
 * because the spec restricts a path to identifier segments, which is checked at
 * the boundary and asserted again here.
 */
const SAFE_SEGMENT = /^[A-Za-z][A-Za-z0-9]*$/;

function textOf(path: string, alias: string): string {
  const resolved = resolvePath(path);
  if (resolved.hop) {
    throw new Error(`This dialect cannot compile the edge-hop path '${path}'`);
  }
  if (resolved.through) {
    // TODO: join the ancestor a context prefix names. Compiling `parent.name`
    // as a local property would answer a different question and look right.
    throw new Error(
      `This dialect cannot reach '${resolved.through}.' yet; use a path on the node itself`
    );
  }
  if (resolved.column) {
    return `${alias}.${resolved.column}${resolved.column === "id" || resolved.column === "parent_id" ? "::text" : ""}`;
  }
  for (const key of resolved.keys) {
    if (!SAFE_SEGMENT.test(key)) {
      throw new Error(`Unsafe path segment '${key}'`);
    }
  }
  return `(${alias}.properties #>> '{${resolved.keys.join(",")}}')`;
}

/** The same extraction, cast for arithmetic. Non-numeric text becomes null. */
function numberOf(path: string, alias: string): string {
  const resolved = resolvePath(path);
  if (resolved.column) {
    return "NULL";
  }
  return `NULLIF(${textOf(path, alias)}, '')::numeric`;
}

function jsonbOf(path: string, alias: string): string {
  const resolved = resolvePath(path);
  if (resolved.column) {
    return `to_jsonb(${alias}.${resolved.column})`;
  }
  return `(${alias}.properties #> '{${resolved.keys.join(",")}}')`;
}

function predicateOf(
  predicate: Predicate,
  params: Params,
  alias: string
): string {
  const { operator, path, value } = predicate;

  if (operator === "exists") {
    return `${jsonbOf(path, alias)} IS NOT NULL`;
  }
  if (operator === "notExists") {
    return `${jsonbOf(path, alias)} IS NULL`;
  }

  const isNumeric =
    NUMERIC_OPERATORS.has(operator) ||
    (operator === "eq" && typeof value === "number") ||
    (operator === "neq" && typeof value === "number");
  const left = isNumeric ? numberOf(path, alias) : textOf(path, alias);

  switch (operator) {
    case "gte":
      return `${left} >= ${params.bind(asNumeric(value))}`;
    case "gt":
      return `${left} > ${params.bind(asNumeric(value))}`;
    case "lte":
      return `${left} <= ${params.bind(asNumeric(value))}`;
    case "lt":
      return `${left} < ${params.bind(asNumeric(value))}`;
    case "eq":
      return `${left} = ${params.bind(asScalar(value))}`;
    case "neq":
      // A row missing the field is not equal to the value, and `<>` on null is
      // null, so it would be dropped. `IS DISTINCT FROM` keeps it.
      return `${left} IS DISTINCT FROM ${params.bind(asScalar(value))}`;
    case "in":
      return `${left} = ANY(${params.bind(asList(value))})`;
    case "notIn":
      return `(${left} IS NULL OR NOT (${left} = ANY(${params.bind(asList(value))})))`;
    case "contains":
      return `${left} ILIKE ${params.bind(`%${like(value)}%`)}`;
    case "startsWith":
      return `${left} ILIKE ${params.bind(`${like(value)}%`)}`;
    case "endsWith":
      return `${left} ILIKE ${params.bind(`%${like(value)}`)}`;
    case "match":
      return `${left} ~ ${params.bind(String(value))}`;
    default:
      // Fail closed: an operator this dialect has not implemented refuses rather
      // than being dropped from the predicate list.
      throw new Error(`Unsupported operator '${operator}'`);
  }
}

function aggregateOf(spec: QuerySpec): string {
  const { field, method } = spec.aggregate;
  if (method === "count") {
    return "count(*)::numeric";
  }
  if (!field) {
    throw new Error(`'${method}' needs a field`);
  }
  return `${method}(${numberOf(field, "n")})`;
}

function asNumeric(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`'${String(value)}' is not a number`);
  }
  return parsed;
}

function asScalar(value: unknown): string {
  return typeof value === "string" ? value : String(value);
}

function asList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    throw new Error("'in' and 'notIn' need a list");
  }
  return value.map(asScalar);
}

/** `%` and `_` are wildcards, so a needle containing them has to be escaped. */
function like(value: unknown): string {
  return asScalar(value).replace(/[%_\\]/g, (match) => `\\${match}`);
}
