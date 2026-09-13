/**
 * The projection emits engine-agnostic Cypher, and the DDL divergence lives
 * here, keyed by `config.graphDatabase.engine`. One file is what keeps the
 * Memgraph-to-Neo4j swap an hours-long operation.
 *
 * Path and component algorithms are not here: they are engine procedures with
 * different names and call shapes, so an analysis writes its own Cypher beside
 * itself rather than adding a method two other analyses depend on.
 */

export interface CypherStatement {
  params: Record<string, unknown>;
  text: string;
}

export interface GraphDialect {
  /** Idempotent DDL run once at boot (indexes / uniqueness). */
  bootstrapStatements(): CypherStatement[];
  readonly engine: "memgraph" | "neo4j";
}

export class MemgraphDialect implements GraphDialect {
  readonly engine = "memgraph" as const;

  bootstrapStatements(): CypherStatement[] {
    // Memgraph community has no unique constraints. Uniqueness is inherent:
    // the sync worker is the only writer and MERGEs on `id`.
    return [
      { text: "CREATE INDEX ON :Node(id)", params: {} },
      { text: "CREATE INDEX ON :Node(class)", params: {} },
      { text: "CREATE INDEX ON :Node(projectId)", params: {} },
    ];
  }
}

export class Neo4jDialect implements GraphDialect {
  readonly engine = "neo4j" as const;

  bootstrapStatements(): CypherStatement[] {
    return [
      {
        text: "CREATE CONSTRAINT graph_node_id IF NOT EXISTS FOR (n:Node) REQUIRE n.id IS UNIQUE",
        params: {},
      },
      {
        text: "CREATE INDEX graph_node_class IF NOT EXISTS FOR (n:Node) ON (n.class)",
        params: {},
      },
      {
        text: "CREATE INDEX graph_node_project IF NOT EXISTS FOR (n:Node) ON (n.projectId)",
        params: {},
      },
    ];
  }
}
