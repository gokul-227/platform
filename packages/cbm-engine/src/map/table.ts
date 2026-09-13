import type {
  CanonicalBlockKey,
  CanonicalClass,
  CanonicalEdgeType,
} from "@aec-craft/platform-contracts";

/**
 * The declarative mapping table. A format profile writes one of these; the
 * engine executes it and never learns what a format is.
 *
 * `from` addresses are opaque strings the profile's own adapter resolves, so
 * the engine needs no opinion on how a source names things. `to` is typed
 * against the vocabulary, so canonical values autocomplete and typos fail to
 * compile while the open leaves stay writable.
 */

/** A canonical value with the open vocabulary still admitted. The second arm
 *  keeps autocomplete showing the canonical entries rather than `string`. */
export type OpenVocabulary<T extends string> =
  | T
  | (string & Record<never, never>);

/** A write target under one governed block key, so a rule cannot write
 *  outside the schema. */
export type BlockPath = `${CanonicalBlockKey}.${string}`;

export interface FieldRule {
  /** Opaque source address, interpreted by the profile's adapter. */
  from: string;
  /** `"name"` sets the node's display name; anything else is a block path. */
  to: "name" | BlockPath;
  /** Id of a transform in the registry, applied to the resolved value. */
  transform?: string;
  /** Canonical target unit. The adapter normalises the source value to it. */
  unit?: string;
}

/** Where an edge's two ends are found on the source instance. */
export interface EndpointRule {
  from: string;
  to: string;
}

/**
 * What a source entity becomes.
 *
 * A node target carries only a class. The structural type is derived from the
 * class root by the schema, so the two cannot disagree.
 */
export type Target =
  | {
      as: "node";
      class?: OpenVocabulary<CanonicalClass>;
      /** Id of a class resolver, for entities whose class depends on data. */
      classFrom?: string;
    }
  | {
      as: "edge";
      endpoints: EndpointRule;
      type: OpenVocabulary<CanonicalEdgeType>;
    }
  | { as: "ignored"; reason: string };

/**
 * How complete an entry is. `ignored` is a real answer, not a gap: it records
 * that we looked at this entity and decided against it, so coverage can be
 * honest about what is dropped on purpose.
 */
export type MappingStatus = "full" | "partial" | "stub" | "ignored";

export interface EntityMapping {
  fields?: FieldRule[];
  /**
   * Which mechanism folder this entry came from, so coverage can report per
   * mechanism instead of as one number that hides which half is weak. Set by
   * the profile when it assembles the folders.
   */
  mechanism?: string;
  /** Source entity type name, e.g. `IfcWall`. */
  source: string;
  /** The profile's own family name, e.g. `element`, `spatial`, `relation`. */
  sourceType: string;
  status: MappingStatus;
  target: Target;
}

export interface MappingTable {
  /** One entry per source type. */
  entries: EntityMapping[];
  format: string;
  /**
   * Rules keyed by a source property address, applied to any instance
   * carrying that property whatever its type.
   *
   * Cross-cutting on purpose: a property that means the same thing on twenty
   * entities is written once rather than twenty times. A rule resolves to
   * nothing on an instance that lacks it, so listing one costs nothing.
   */
  propertyRules?: FieldRule[];
  version: string;
}
