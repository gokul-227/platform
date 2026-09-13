import type { EndpointRule } from "./table";

/** The least an instance must carry: what type it is and a stable id. */
export interface SourceInstance {
  source: string;
  sourceId: string;
}

/** One entry of a format's type universe, used as a coverage denominator. */
export interface SourceTypeRef {
  source: string;
  sourceType: string;
}

/**
 * The format plug.
 *
 * Everything format-specific lives behind three members: what the format is
 * called, how a value is addressed and normalised, and how a relationship names
 * its ends. The engine calls them and never mentions a format.
 */
export interface SourceAdapter<I extends SourceInstance = SourceInstance> {
  /** The two ends of an edge-producing instance, as source ids. */
  endpoints(instance: I, rule: EndpointRule): { from: string[]; to: string[] };
  format: string;
  /** Resolve a `FieldRule.from` address, converted to `unit` when given. */
  resolve(instance: I, address: string, unit?: string): unknown;
}
