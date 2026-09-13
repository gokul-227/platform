import type {
  ConnectivityInput,
  ConnectivityResponse,
} from "@aec-craft/platform-contracts";
import { Inject, Injectable } from "@nestjs/common";
import type { AnalysisScope } from "../analysis.scope";
import { CypherQueryService } from "../query/cypher.query.service";
import { PASSABLE_GRAPH } from "../query/passable.graph";

/**
 * Read undirected: a space behind a one-way door is still a space somebody drew,
 * and what this looks for is the door nobody drew. Getting *out* through a
 * passage is egress, walked in the direction of travel.
 */
const COMPONENTS = `${PASSABLE_GRAPH}
  CALL weakly_connected_components.get(graph)
  YIELD node, component_id
  RETURN component_id AS island, collect(node.id) AS nodeIds`;

@Injectable()
export class AnalysisConnectivityService {
  constructor(
    @Inject(CypherQueryService) private readonly cypher: CypherQueryService
  ) {}

  async analyse(
    scope: AnalysisScope,
    input: ConnectivityInput
  ): Promise<ConnectivityResponse> {
    const rows = await this.cypher.run(scope, {
      cypher: COMPONENTS,
      params: { parentId: input.parentId ?? null },
    });

    // One row is one island: the procedure groups them before they get here.
    const islands = rows
      .map((row) => (Array.isArray(row.nodeIds) ? row.nodeIds.map(String) : []))
      .filter((island) => island.length > 0)
      .sort((a, b) => b.length - a.length);
    const spaces = islands.reduce((total, island) => total + island.length, 0);

    if (islands.length <= 1) {
      // One island, or nothing to examine. Either way there is nothing to
      // explain, and `spaces` is what tells those two apart.
      return { connected: true, spaces };
    }

    return {
      connected: false,
      disconnected: {
        islands,
        // Everything but the largest: the count somebody acts on.
        spaces: spaces - (islands[0]?.length ?? 0),
      },
      spaces,
    };
  }
}
