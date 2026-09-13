// The engine executes declarations it does not own: a mapping table from a
// format profile, and derive passes from wherever the host gets them.

export { type BuildOptions, type BuildResult, build } from "./build";
export {
  type ChangesetOptions,
  toChangeset,
} from "./changeset";
export {
  type WorkingEdge,
  WorkingGraph,
  type WorkingNode,
} from "./core/graph.working";
export { edgeId, nodeId, scopeKeyOf } from "./core/id";
export {
  type CoverageBucket,
  type CoverageDenominators,
  type CoverageReport,
  coverage,
  formatCoverage,
} from "./map/coverage";
export {
  type ClassResolver,
  type MapOptions,
  type MapResult,
  mapInstances,
} from "./map/map";
export type {
  SourceAdapter,
  SourceInstance,
  SourceTypeRef,
} from "./map/source";
export type {
  BlockPath,
  EndpointRule,
  EntityMapping,
  FieldRule,
  MappingStatus,
  MappingTable,
  OpenVocabulary,
  Target,
} from "./map/table";
export type { FieldTransform, TransformRegistry } from "./map/transforms";
export type { FormatProfile } from "./profile";
