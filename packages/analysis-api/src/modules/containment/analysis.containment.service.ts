import type {
  ContainedTwice,
  ContainmentInput,
  ContainmentResponse,
} from "@aec-craft/platform-contracts";
import { Inject, Injectable } from "@nestjs/common";
import type { AnalysisScope } from "../analysis.scope";
import { CypherQueryService } from "../query/cypher.query.service";
import { scopedNodes } from "../query/scope.cypher";

/**
 * Containment is expressed as `parentId` and as a `contains` edge, and an importer
 * may use either: the clinic export writes edges and leaves the column null on
 * all 200 spaces. An orphan has neither.
 * TODO(#229): read one relation once `parentId` is retired.
 */
const CONTAINERS = `
  MATCH (n:Node)
  WHERE ${scopedNodes("n")}
    AND any(root IN $classes WHERE n.class = root OR n.class STARTS WITH (root + '.'))
  OPTIONAL MATCH (p:Node)-[:\`CONTAINS\`]->(n)
  WHERE ${scopedNodes("p")}
  WITH n, collect(DISTINCT p.id) AS viaEdge
  RETURN n.id AS nodeId,
         [x IN viaEdge + [n.parentId] WHERE x IS NOT NULL] AS parentIds`;

@Injectable()
export class AnalysisContainmentService {
  constructor(
    @Inject(CypherQueryService) private readonly cypher: CypherQueryService
  ) {}

  async analyse(
    scope: AnalysisScope,
    input: ContainmentInput
  ): Promise<ContainmentResponse> {
    const rows = await this.cypher.run(scope, {
      cypher: CONTAINERS,
      params: { classes: input.classes },
    });

    const orphans: string[] = [];
    const containedTwice: ContainedTwice[] = [];
    for (const row of rows) {
      const nodeId = String(row.nodeId);
      const parentIds = Array.isArray(row.parentIds)
        ? [...new Set(row.parentIds.map(String))]
        : [];
      if (parentIds.length === 0) {
        orphans.push(nodeId);
      } else if (parentIds.length > 1) {
        containedTwice.push({ nodeId, parentIds });
      }
    }

    return {
      containedTwice,
      examined: rows.length,
      orphans,
      sound: orphans.length === 0 && containedTwice.length === 0,
    };
  }
}
