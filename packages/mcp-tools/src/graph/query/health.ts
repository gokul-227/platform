import { graphHealthResponseSchema } from "@aec-craft/platform-contracts";
import { z } from "zod";

import { defineTool } from "../../common/descriptor";

const projectGraphHealthInputSchema = z.object({
  projectId: z.string().uuid().describe("The project id."),
});

export const graphHealthTool = defineTool({
  name: "graph_health",
  description:
    "Reachability probe: is the projected graph DB reachable (requires `read` on the project)? " +
    "Always answers `{ reachable, engine, latencyMs }` — `engine` is the configured graph " +
    "engine (memgraph / neo4j, or null when none is configured) and `latencyMs` is the measured " +
    "connectivity round-trip (null when unreachable). It does not lint the projection.",
  inputSchema: projectGraphHealthInputSchema,
  outputSchema: graphHealthResponseSchema,
  resource: "api",
  endpoint: { method: "GET", path: "/graph/health" },
  scopes: ["openid"],
});
