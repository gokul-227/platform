import type {
  AdjacencyInput,
  AdjacencyResponse,
  AdjacentPair,
} from "@aec-craft/platform-contracts";
import { Inject, Injectable } from "@nestjs/common";
import type { AnalysisScope } from "../analysis.scope";
import { CypherQueryService } from "../query/cypher.query.service";
import { scopedNodes } from "../query/scope.cypher";

/** `a.id < b.id` keeps an undirected read from returning each pair twice. */
const PAIRS = `
  MATCH (a:Node)-[:\`ADJACENT_TO\`]-(b:Node)
  WHERE ${scopedNodes("a", "b")}
    AND (a.class = 'space' OR a.class STARTS WITH ('space' + '.'))
    AND (b.class = 'space' OR b.class STARTS WITH ('space' + '.'))
    AND a.id < b.id
    AND ($parentId IS NULL OR (a.parentId = $parentId AND b.parentId = $parentId))
  RETURN a.id AS aId, a.programme.use AS aUse,
         b.id AS bId, b.programme.use AS bUse`;

/** How many spaces were in scope at all, so no pairs over no spaces reads right. */
const SPACES = `
  MATCH (n:Node)
  WHERE ${scopedNodes("n")}
    AND (n.class = 'space' OR n.class STARTS WITH ('space' + '.'))
    AND ($parentId IS NULL OR n.parentId = $parentId)
  RETURN count(n) AS examined`;

@Injectable()
export class AnalysisAdjacencyService {
  constructor(
    @Inject(CypherQueryService) private readonly cypher: CypherQueryService
  ) {}

  async analyse(
    scope: AnalysisScope,
    input: AdjacencyInput
  ): Promise<AdjacencyResponse> {
    const params = { parentId: input.parentId ?? null };
    const [pairRows, spaceRows] = await Promise.all([
      this.cypher.run(scope, { cypher: PAIRS, params }),
      this.cypher.run(scope, { cypher: SPACES, params }),
    ]);

    const pairs: AdjacentPair[] = pairRows
      .map((row) => ({
        aId: String(row.aId),
        aUse: typeof row.aUse === "string" ? row.aUse : null,
        bId: String(row.bId),
        bUse: typeof row.bUse === "string" ? row.bUse : null,
      }))
      // Unknown uses are not differing uses: dropping them would report
      // separation as satisfied where nothing is known about it.
      .filter(
        (pair) =>
          !input.differingUseOnly ||
          (pair.aUse !== null && pair.bUse !== null && pair.aUse !== pair.bUse)
      );

    return { examined: Number(spaceRows[0]?.examined ?? 0), pairs };
  }
}
