import type { ClassResolver } from "./map/map";
import type { SourceAdapter, SourceInstance } from "./map/source";
import type { MappingTable } from "./map/table";
import type { TransformRegistry } from "./map/transforms";

/**
 * What a source format contributes. One of these per format, and every one has
 * the same shape.
 *
 * The contract is deliberately small. A profile brings knowledge (what an
 * entity means, where a property belongs) and the engine brings machinery.
 * Nothing here mentions how the engine runs, and nothing in the engine
 * mentions a format.
 *
 * Note what is absent. There is no shared list of mechanisms, because formats
 * decompose differently and pretending otherwise is how an abstraction starts
 * lying; what is shared is the shape of a profile, not its contents. And there
 * is no coverage denominator, because measuring coverage is a tooling concern
 * rather than something every profile owes at runtime.
 */
export interface FormatProfile<I extends SourceInstance = SourceInstance> {
  /** Builds the adapter for one parsed model. */
  adapter(model: unknown): SourceAdapter<I>;
  /** Class resolvers named by `Target.classFrom`. */
  classResolvers?: Record<string, ClassResolver<I>>;
  /** Stamped into `interop.format` on every node. */
  format: string;
  map: MappingTable;
  /** Value transforms named by `FieldRule.transform`. */
  transforms?: TransformRegistry;
}
