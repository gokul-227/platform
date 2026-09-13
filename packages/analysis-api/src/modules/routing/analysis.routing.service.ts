import type {
  RoutingInput,
  RoutingResponse,
} from "@aec-craft/platform-contracts";
import { Inject, Injectable } from "@nestjs/common";
import type { AnalysisScope } from "../analysis.scope";
import { CypherQueryService } from "../query/cypher.query.service";
import { TRAVEL_COST } from "../query/passable.graph";
import { scopedNodes } from "../query/scope.cypher";

/** Directed: a one-way door must not be escaped backwards through. */
const ROUTE = `
  MATCH (from:Node {id: $fromId}), (to:Node {id: $toId})
  WHERE ${scopedNodes("from", "to")}
  MATCH path = (from)-[:\`CONNECTS_TO\` *wShortest ${TRAVEL_COST} total]->(to)
  RETURN total AS value,
         [space IN nodes(path) | space.id] AS nodeIds,
         all(r IN relationships(path) WHERE r.length IS NOT NULL) AS inMetres
  LIMIT 1`;

@Injectable()
export class AnalysisRoutingService {
  constructor(
    @Inject(CypherQueryService) private readonly cypher: CypherQueryService
  ) {}

  async analyse(
    scope: AnalysisScope,
    input: RoutingInput
  ): Promise<RoutingResponse> {
    const rows = await this.cypher.run(scope, {
      cypher: ROUTE,
      params: { fromId: input.fromId, toId: input.toId },
    });

    const row = rows[0];
    if (!row) {
      return { reachable: false };
    }
    return {
      // A hop count cannot settle a rule with a metric bound.
      measuredIn: row.inMetres === true ? "metres" : "hops",
      nodeIds: Array.isArray(row.nodeIds) ? row.nodeIds.map(String) : [],
      reachable: true,
      value: Number(row.value ?? 0),
    };
  }
}
