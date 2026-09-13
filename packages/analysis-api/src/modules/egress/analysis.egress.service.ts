import type {
  EgressInput,
  EgressResponse,
  EgressSpace,
} from "@aec-craft/platform-contracts";
import { Inject, Injectable } from "@nestjs/common";
import type { AnalysisScope } from "../analysis.scope";
import { CypherQueryService } from "../query/cypher.query.service";
import { TRAVEL_COST } from "../query/passable.graph";
import { scopedNodes } from "../query/scope.cypher";

/** Enough to see where the limit is closest to breaking, without a wall of rows. */
const FURTHEST = 10;

/** Exits are named, never guessed: a model marking none is scored as unknown. */
const EXITS = `
  MATCH (n:Node)
  WHERE ${scopedNodes("n")}
    AND (n.class = 'space' OR n.class STARTS WITH ('space' + '.'))
    AND ($exitIds IS NULL OR n.id IN $exitIds)
    AND ($exitIds IS NOT NULL OR n.programme.egressRole IS NOT NULL)
  RETURN n.id AS nodeId`;

/**
 * Directed, toward the exit. The unreachable are found by difference: wShortest
 * returns no row for a space with no path, and a query cannot report a row it
 * never produced.
 */
const DISTANCES = `
  MATCH (exit:Node) WHERE exit.id IN $exitIds AND ${scopedNodes("exit")}
  MATCH (n:Node)
  WHERE ${scopedNodes("n")}
    AND (n.class = 'space' OR n.class STARTS WITH ('space' + '.'))
    AND ($parentId IS NULL OR n.parentId = $parentId)
    AND NOT n.id IN $exitIds
  MATCH path = (n)-[:\`CONNECTS_TO\` *wShortest ${TRAVEL_COST} total]->(exit)
  WITH n, exit, total,
       all(r IN relationships(path) WHERE r.length IS NOT NULL) AS inMetres
  ORDER BY total ASC
  WITH n, collect({exit: exit.id, total: total, inMetres: inMetres})[0] AS best
  RETURN n.id AS nodeId, best.exit AS exitId, best.total AS value,
         best.inMetres AS inMetres`;

/** Every space in scope, so the ones with no route show up by their absence. */
const SPACES = `
  MATCH (n:Node)
  WHERE ${scopedNodes("n")}
    AND (n.class = 'space' OR n.class STARTS WITH ('space' + '.'))
    AND ($parentId IS NULL OR n.parentId = $parentId)
  RETURN n.id AS nodeId`;

@Injectable()
export class AnalysisEgressService {
  constructor(
    @Inject(CypherQueryService) private readonly cypher: CypherQueryService
  ) {}

  async analyse(
    scope: AnalysisScope,
    input: EgressInput
  ): Promise<EgressResponse> {
    const params = {
      exitIds: input.exitIds ?? null,
      parentId: input.parentId ?? null,
    };
    const [exitRows, spaceRows] = await Promise.all([
      this.cypher.run(scope, { cypher: EXITS, params }),
      this.cypher.run(scope, { cypher: SPACES, params }),
    ]);

    const exitIds = exitRows.map((row) => String(row.nodeId));
    const spaces = spaceRows.map((row) => String(row.nodeId));
    if (exitIds.length === 0) {
      // Nothing marked as a way out: report unknown, never pass by default.
      return {
        examined: spaces.length,
        exits: 0,
        furthest: [],
        measuredIn: "hops",
        overLimit: [],
        unreachable: spaces,
      };
    }

    const rows = await this.cypher.run(scope, {
      cypher: DISTANCES,
      params: { ...params, exitIds },
    });

    const reached: EgressSpace[] = rows.map((row) => ({
      exitId: String(row.exitId),
      nodeId: String(row.nodeId),
      value: Number(row.value ?? 0),
    }));
    reached.sort((a, b) => b.value - a.value);

    const measuredIn = rows.every((row) => row.inMetres === true)
      ? "metres"
      : "hops";
    const limit = input.maxDistance;
    const found = new Set(reached.map((entry) => entry.nodeId));
    const unreachable = spaces.filter(
      (id) => !(found.has(id) || exitIds.includes(id))
    );

    return {
      examined: spaces.length - exitIds.length,
      exits: exitIds.length,
      furthest: reached.slice(0, FURTHEST),
      measuredIn,
      // A metric limit cannot be settled by a hop count.
      overLimit:
        limit !== undefined && measuredIn === "metres"
          ? reached.filter((entry) => entry.value > limit)
          : [],
      unreachable,
    };
  }
}
