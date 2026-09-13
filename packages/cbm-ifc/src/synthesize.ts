/**
 * Building mappable instances out of scanned facts.
 *
 * Mirrors `scan.ts`. Each mechanism owns the synthesis for its own
 * relationship; this holds the two things every one of them needs.
 */

import type { IfcInstance } from "./types";

/**
 * A relation instance.
 *
 * A relationship carries no properties of its own, so both property bags are
 * always empty. Stating that once is the point.
 */
export function createRelation(
  source: string,
  sourceId: string,
  attributes: Record<string, unknown>
): IfcInstance {
  return { source, sourceId, attributes, psets: {}, quantities: {} };
}

/**
 * Whether every endpoint became an instance.
 *
 * An edge naming a node that is not there fails the entire changeset, so one
 * unmapped element would otherwise cost the whole import. Every synthesis
 * drops the relationships it cannot fully resolve.
 */
export function allMapped(
  mapped: ReadonlySet<string>,
  ...guids: readonly (string | null | undefined)[]
): boolean {
  return guids.every(
    (guid) => guid !== null && guid !== undefined && mapped.has(guid)
  );
}
