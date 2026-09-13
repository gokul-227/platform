import type { ApiDocumentSpec } from "@aec-craft/platform-common/nest";

import { GraphApiModule } from "../config/api.module";
import { GraphBatchModule } from "../modules/batch/graph.batch.module";
import { GraphEdgeModule } from "../modules/edges/graph.edge.module";
import { GraphNodeModule } from "../modules/nodes/graph.node.module";
import { GraphQueryModule } from "../modules/query/graph.query.module";

export const graphApiDocument: ApiDocumentSpec = {
  include: [
    GraphApiModule,
    GraphBatchModule,
    GraphNodeModule,
    GraphEdgeModule,
    GraphQueryModule,
  ],
  path: "openapi-graph",
  sourceTitle: "Graph",
  title: "Graph API",
  tags: [
    {
      name: "Graph changeset",
      description:
        "The one write surface: nodes and edges in a single transaction, landing in whichever scope `?orgId=` or `?projectId=` names. Every mutation goes through it, so a node and the edges touching it ride in one call and versioning stays correct.",
    },
    {
      name: "Graph nodes",
      description:
        "The building's rows: objects, rules and sources. Read a scope with `?orgId=` or `?projectId=`; a project read hydrates the parent org's shared library and `?scope=project` narrows to the project's own. A by-id read stays flat, because a row carries its scope on the row.",
    },
    {
      name: "Graph edges",
      description:
        "How the rows relate. Same scope, filter, cursor and projection grammar as nodes; endpoints are immutable, so a re-pointed edge is a delete and a create in one changeset.",
    },
    {
      name: "Graph queries",
      description:
        "Free-form read-only openCypher against the projected graph database (EXPERIMENTAL), not the relational source of truth. Project-scoped only, since the projection is queried through the injected `$orgId` / `$projectId`. One open endpoint for the exploration phase: write clauses are rejected and returned graph entities are scope-checked fail-closed. Results can trail writes by the sync lag (target p99 < 5s). A deployment with no graph database configured (`GRAPH_DB_URI`) cannot serve these routes at all. Typed traversal routes will supersede common patterns later.",
    },
  ],
};
