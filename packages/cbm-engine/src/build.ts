import type { GraphBatchInput } from "@aec-craft/platform-contracts";

import { toChangeset } from "./changeset";
import { WorkingGraph } from "./core/graph.working";
import { type MapOptions, type MapResult, mapInstances } from "./map/map";
import type { SourceInstance } from "./map/source";

/**
 * The same bag the map stage takes. `build()` does that work and then
 * serialises, so an alias rather than a second declaration that can drift.
 */
export type BuildOptions<I extends SourceInstance> = MapOptions<I>;

/**
 * The map stage's own result with the working graph already serialised.
 *
 * `unmapped` is picked from `MapResult` rather than restated, because it is
 * literally the number the map stage reported and should stay tied to it.
 */
export type BuildResult = Pick<MapResult, "unmapped"> & {
  changeset: GraphBatchInput;
};

/**
 * Build a cognitive building model: map, then serialise.
 *
 * The two stages are separate everywhere else in this package; this is the one
 * place that says they happen in that order, and it exists so a caller with
 * nothing unusual to do writes one line instead of three.
 *
 * A caller that wants to enrich the graph in between calls `mapInstances`,
 * mutates the `WorkingGraph` it builds, and calls `toChangeset` itself. The
 * engine has no opinion on what that enrichment is, which is why it ships none.
 *
 * Pure and isomorphic: the same call runs in a browser and in a worker.
 */
export function build<I extends SourceInstance>(
  options: BuildOptions<I>
): BuildResult {
  const mapped = mapInstances(options);
  const graph = new WorkingGraph(mapped.nodes, mapped.edges);

  return {
    changeset: toChangeset(graph, {
      format: options.adapter.format,
      scope: options.scope,
    }),
    unmapped: mapped.unmapped,
  };
}
