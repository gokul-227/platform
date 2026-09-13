/**
 * Scope predicates for hand-written Cypher, mirroring the drizzle ones in
 * `../drizzle/scope.ts`: a partition predicate saying which project's rows were
 * asked for, and a group predicate saying which of them this caller may see.
 *
 * Every query needs both on every node it binds. Writing them by hand is how one
 * gets forgotten on a second alias, which is invisible: the query still returns
 * rows, just somebody else's.
 */

/** The parameters a scoped statement binds. Names are fixed so the check can look for them. */
export const CYPHER_SCOPE_PARAMS = {
  groups: "$groups",
  projectId: "$projectId",
} as const;

/**
 * The predicate for one or more node aliases.
 *
 *   scopedNodes("a", "b")
 *   → (a.projectId = $projectId AND a.groupId IN $groups)
 *     AND (b.projectId = $projectId AND b.groupId IN $groups)
 *
 * An empty `$groups` makes `IN` false, so a caller who may read nothing matches
 * nothing rather than everything.
 */
export function scopedNodes(...aliases: string[]): string {
  return aliases
    .map(
      (alias) =>
        `(${alias}.projectId = ${CYPHER_SCOPE_PARAMS.projectId} AND ${alias}.groupId IN ${CYPHER_SCOPE_PARAMS.groups})`
    )
    .join("\n    AND ");
}

/**
 * The same predicate for every node on a variable-length path, which a `WHERE`
 * on the pattern cannot reach: the intermediates are bound by the expansion, not
 * by an alias.
 */
export function scopedPath(pathAlias: string): string {
  return `all(x IN nodes(${pathAlias}) WHERE x.projectId = ${CYPHER_SCOPE_PARAMS.projectId} AND x.groupId IN ${CYPHER_SCOPE_PARAMS.groups})`;
}

const NODE_ALIAS = /\(\s*([A-Za-z_][A-Za-z0-9_]*)\s*:\s*Node\b/g;
const LINE_COMMENT = /\/\/[^\n]*/g;
const BLOCK_COMMENT = /\/\*[\s\S]*?\*\//g;
const STRING_LITERAL = /'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"/g;

/**
 * Comments and string literals removed before the check reads the statement.
 * `includes` cannot tell a predicate from a mention of one, so a scope clause
 * written inside a comment would satisfy it while scoping nothing.
 */
function executable(cypher: string): string {
  return cypher
    .replace(BLOCK_COMMENT, " ")
    .replace(LINE_COMMENT, " ")
    .replace(STRING_LITERAL, " ");
}

/**
 * Every node alias the statement binds carries both predicates.
 *
 * Stricter than checking the parameters appear somewhere: a statement that scopes
 * `a` and forgets `b` mentions both parameters and still reads across projects.
 * It cannot prove a predicate sits in the right clause, only that no bound node
 * is missing one — which is the mistake that actually happens.
 *
 * Two things it cannot do, both stated so nobody assumes otherwise. It does not
 * read clause structure, so a predicate defeated by an `OR` around it still
 * passes. And intermediates on a variable-length path are not aliases, so
 * `scopedPath` covers those and this cannot see them.
 *
 * That is the right strength for what this defends against: every statement it
 * checks is a constant in this repo, with caller input arriving as bound
 * parameters, so the failure it exists to catch is an author forgetting a clause
 * rather than anybody injecting one.
 */
export function assertCypherScoped(cypher: string): void {
  const text = executable(cypher);
  const aliases = [...text.matchAll(NODE_ALIAS)].map((match) => match[1]);
  const unscoped = [...new Set(aliases)].filter((alias) => {
    const partition = `${alias}.projectId = ${CYPHER_SCOPE_PARAMS.projectId}`;
    const group = `${alias}.groupId IN ${CYPHER_SCOPE_PARAMS.groups}`;
    return !(text.includes(partition) && text.includes(group));
  });

  if (aliases.length === 0) {
    throw new Error("A projection query must bind at least one (x:Node)");
  }
  if (unscoped.length > 0) {
    throw new Error(
      `Unscoped node ${unscoped.length > 1 ? "aliases" : "alias"} ${unscoped.join(", ")}: every (x:Node) needs ${CYPHER_SCOPE_PARAMS.projectId} and ${CYPHER_SCOPE_PARAMS.groups}`
    );
  }
}
