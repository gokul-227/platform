import type {
  GraphBatchInput,
  GraphScope,
} from "@aec-craft/platform-contracts";
import type { WorkingGraph } from "./core/graph.working";
import { edgeId, scopeKeyOf } from "./core/id";

export interface ChangesetOptions {
  /** The source format, part of every derived edge's id. */
  format: string;
  scope: GraphScope;
}

/**
 * Serialise the working graph into one changeset. The single exit point.
 *
 * The only place `WorkingNode` becomes `GraphNodeOp`. Nothing else in the
 * codebase produces a changeset: graph-api consumes them, and the SDK's upsert
 * helpers are single-item conveniences, so this is the whole of it.
 *
 * Exported separately from `build()` because `mapInstances` is too: a caller
 * that wants to map without deriving still needs somewhere to serialise.
 *
 * Everything becomes an upsert, because every id is derived: re-running the
 * same import converges rather than duplicating. Mapped edges already carry an
 * id; derived edges are stamped here from their endpoints, which are
 * themselves derived, so a re-derive lands on the same identity.
 */
export function toChangeset(
  graph: WorkingGraph,
  options: ChangesetOptions
): GraphBatchInput {
  const scopeKey = scopeKeyOf(options.scope);
  return {
    nodes: graph.nodes.map((node) => ({
      op: "upsert" as const,
      id: node.id,
      type: node.type,
      class: node.class,
      name: node.name,
      properties: node.properties,
    })),
    edges: graph.edges.map((edge) => ({
      op: "upsert" as const,
      id:
        edge.id ??
        edgeId(
          scopeKey,
          options.format,
          edge.type,
          edge.sourceId,
          edge.targetId
        ),
      sourceId: edge.sourceId,
      targetId: edge.targetId,
      type: edge.type,
      properties: edge.properties ?? {},
    })),
  };
}
