import type {
  ChokepointPassage,
  ChokepointSpace,
  ChokepointsInput,
  ChokepointsResponse,
} from "@aec-craft/platform-contracts";
import { Inject, Injectable } from "@nestjs/common";
import type { AnalysisScope } from "../analysis.scope";
import { CypherQueryService } from "../query/cypher.query.service";
import { PASSABLE_GRAPH } from "../query/passable.graph";
import { scopedNodes } from "../query/scope.cypher";

/** Passages whose loss splits their island. */
const BRIDGES = `${PASSABLE_GRAPH}
  CALL bridges.get(graph)
  YIELD node_from, node_to
  RETURN node_from.id AS fromId, node_to.id AS toId`;

/** The graph itself: a bridge says nothing about how much it carries. */
const PASSAGES = `${PASSABLE_GRAPH}
  UNWIND [1] AS one
  MATCH (a:Node)-[:\`CONNECTS_TO\`]-(b:Node)
  WHERE ${scopedNodes("a", "b")}
  RETURN a.id AS fromId, b.id AS toId`;

/** Every space in scope, so an isolated one is counted rather than inferred. */
const SPACES = `
  MATCH (n:Node)
  WHERE ${scopedNodes("n")}
    AND (n.class = 'space' OR n.class STARTS WITH ('space' + '.'))
    AND ($parentId IS NULL OR n.parentId = $parentId)
  RETURN n.id AS nodeId`;

type Adjacency = Map<string, Set<string>>;

@Injectable()
export class AnalysisChokepointsService {
  constructor(
    @Inject(CypherQueryService) private readonly cypher: CypherQueryService
  ) {}

  async analyse(
    scope: AnalysisScope,
    input: ChokepointsInput
  ): Promise<ChokepointsResponse> {
    const params = { parentId: input.parentId ?? null };
    const [bridgeRows, passageRows, spaceRows] = await Promise.all([
      this.cypher.run(scope, { cypher: BRIDGES, params }),
      this.cypher.run(scope, { cypher: PASSAGES, params }),
      this.cypher.run(scope, { cypher: SPACES, params }),
    ]);

    const nodes = spaceRows.map((row) => String(row.nodeId));
    const adjacency = buildAdjacency(nodes, passageRows);

    // The smaller side is what is stranded; the larger side is the building.
    const passages: ChokepointPassage[] = bridgeRows
      .map((row) => {
        const fromId = String(row.fromId);
        const toId = String(row.toId);
        return {
          fromId,
          stranded: strandedWithoutPassage(adjacency, fromId, toId),
          toId,
        };
      })
      .sort((a, b) => b.stranded - a.stranded);

    const spaces: ChokepointSpace[] = cutVertices(adjacency)
      .map((nodeId) => ({
        nodeId,
        stranded: strandedWithoutSpace(adjacency, nodeId),
      }))
      .sort((a, b) => b.stranded - a.stranded);

    return {
      examined: nodes.length,
      passages,
      // No passages means no chokepoints and no robustness; read with examined.
      robust: passages.length === 0 && spaces.length === 0,
      spaces,
    };
  }
}

function buildAdjacency(
  nodes: readonly string[],
  passages: readonly Record<string, unknown>[]
): Adjacency {
  const adjacency: Adjacency = new Map(nodes.map((id) => [id, new Set()]));
  for (const row of passages) {
    const from = String(row.fromId);
    const to = String(row.toId);
    // Undirected: a one-way door still joins the two rooms it sits between.
    adjacency.get(from)?.add(to);
    adjacency.get(to)?.add(from);
  }
  return adjacency;
}

/** How many nodes the smaller side holds once one passage is taken away. */
function strandedWithoutPassage(
  adjacency: Adjacency,
  fromId: string,
  toId: string
): number {
  const reached = reachableFrom(adjacency, fromId, {
    skipEdge: [fromId, toId],
  });
  const island = reachableFrom(adjacency, fromId);
  return Math.min(reached.size, island.size - reached.size);
}

/** How many nodes lose touch with the rest once one space is impassable. */
function strandedWithoutSpace(adjacency: Adjacency, nodeId: string): number {
  const island = reachableFrom(adjacency, nodeId);
  const remaining = new Set(island);
  remaining.delete(nodeId);
  const start = [...remaining][0];
  if (start === undefined) {
    return 0;
  }
  const stillReachable = reachableFrom(adjacency, start, { skipNode: nodeId });
  return remaining.size - stillReachable.size;
}

function reachableFrom(
  adjacency: Adjacency,
  start: string,
  options?: { skipEdge?: [string, string]; skipNode?: string }
): Set<string> {
  const seen = new Set<string>();
  if (start === options?.skipNode) {
    return seen;
  }
  const queue = [start];
  seen.add(start);
  while (queue.length > 0) {
    const current = queue.pop() as string;
    for (const next of adjacency.get(current) ?? []) {
      if (next === options?.skipNode || seen.has(next)) {
        continue;
      }
      const [a, b] = options?.skipEdge ?? [];
      const isSkipped =
        (current === a && next === b) || (current === b && next === a);
      if (isSkipped) {
        continue;
      }
      seen.add(next);
      queue.push(next);
    }
  }
  return seen;
}

/**
 * Cut vertices, Hopcroft and Tarjan. Iterative: a long corridor run is a deep
 * tree, and a stack overflow on a real building is a poor way to find that out.
 */
function cutVertices(adjacency: Adjacency): string[] {
  const discovered = new Map<string, number>();
  const low = new Map<string, number>();
  const parent = new Map<string, string | null>();
  const found = new Set<string>();
  let counter = 0;

  for (const root of adjacency.keys()) {
    if (discovered.has(root)) {
      continue;
    }
    parent.set(root, null);
    let rootChildren = 0;
    const stack: { neighbours: string[]; node: string; next: number }[] = [
      { neighbours: [...(adjacency.get(root) ?? [])], node: root, next: 0 },
    ];
    counter += 1;
    discovered.set(root, counter);
    low.set(root, counter);

    while (stack.length > 0) {
      const frame = stack.at(-1) as (typeof stack)[number];
      if (frame.next < frame.neighbours.length) {
        const next = frame.neighbours[frame.next] as string;
        frame.next += 1;
        if (!discovered.has(next)) {
          parent.set(next, frame.node);
          if (frame.node === root) {
            rootChildren += 1;
          }
          counter += 1;
          discovered.set(next, counter);
          low.set(next, counter);
          stack.push({
            neighbours: [...(adjacency.get(next) ?? [])],
            node: next,
            next: 0,
          });
        } else if (next !== parent.get(frame.node)) {
          low.set(
            frame.node,
            Math.min(low.get(frame.node) ?? 0, discovered.get(next) ?? 0)
          );
        }
        continue;
      }

      stack.pop();
      const above = parent.get(frame.node);
      if (above == null) {
        continue;
      }
      low.set(above, Math.min(low.get(above) ?? 0, low.get(frame.node) ?? 0));
      if (
        above !== root &&
        (low.get(frame.node) ?? 0) >= (discovered.get(above) ?? 0)
      ) {
        found.add(above);
      }
    }

    if (rootChildren > 1) {
      found.add(root);
    }
  }
  return [...found];
}
