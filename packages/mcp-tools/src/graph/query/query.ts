import {
  cypherQueryInputSchema,
  cypherQueryResponseSchema,
} from "@aec-craft/platform-contracts";
import { z } from "zod";

import { defineTool } from "../../common/descriptor";

const projectGraphQueryInputSchema = z
  .object({
    projectId: z.string().uuid().describe("The project id."),
  })
  .merge(cypherQueryInputSchema);

export const graphQueryTool = defineTool({
  name: "graph_query",
  description:
    "Run a read-only openCypher query against a project's projected graph view (EXPERIMENTAL). " +
    "Requires `read` on the project. **Every node pattern must carry the `:Scoped` label**, which " +
    "the server replaces with this project's own: `MATCH (n:Scoped) RETURN n`, " +
    "`MATCH (s:Storey:Scoped)-[r:CONTAINS]->(e:Scoped) RETURN s, r, e`. A pattern without it is " +
    "refused, because an unlabelled node matches every tenant's rows. Do not write `Scope_`, " +
    "`Org_` or `Project_` labels yourself, and do not use variable-length hops (`[*1..3]`); both " +
    "are refused. A read sees this project's rows and not the organization's shared library — use " +
    "the object and rule tools for that. `$orgId` and `$projectId` are injected for filtering on " +
    "properties. Write clauses are rejected — all writes go through the changeset tools so " +
    "versioning and sync stay correct. Returns the records (nodes, relationships and paths mapped " +
    "to tagged JSON shapes, capped at 1000 rows), which can trail writes by the sync lag.",
  inputSchema: projectGraphQueryInputSchema,
  outputSchema: cypherQueryResponseSchema,
  resource: "api",
  endpoint: { method: "POST", path: "/graph/query" },
  scopes: ["openid"],
});
