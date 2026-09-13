import { guidIndex, type LineRef, resolveGuid } from "../scan";

/** A filler and the host it ends up in, composed through the opening. */
export interface IfcHosting {
  /** The door or window filling the void. */
  fillerGuid: string;
  /** The `IfcRelFillsElement` GlobalId, so the edge has a stable identity. */
  guid: string;
  /** The wall or slab that was voided. */
  hostGuid: string;
}

/** A void nothing fills: a doorless threshold. The host is walkable there. */
export interface IfcOpenPassage {
  hostGuid: string;
  /** The unfilled opening's GlobalId, reused as the connector's identity. */
  openingGuid: string;
}

export interface IfcOpeningScan {
  hostings: IfcHosting[];
  openPassages: IfcOpenPassage[];
}

const VOIDS =
  /IFCRELVOIDSELEMENT\s*\(\s*'[^']+'\s*,[^,]*,[^,]*,[^,]*,\s*(#\d+)\s*,\s*(#\d+)\s*\)/g;

const FILLS =
  /IFCRELFILLSELEMENT\s*\(\s*'([^']+)'\s*,[^,]*,[^,]*,[^,]*,\s*(#\d+)\s*,\s*(#\d+)\s*\)/g;

/**
 * Compose voiding and filling into the fact IFC never states.
 *
 * The file says the wall is voided by an opening, and separately that the
 * opening is filled by the door. Neither says the door is in the wall. This
 * joins them on the opening and produces that.
 *
 * Whatever is left over, an opening voiding a host that nothing fills, is a
 * doorless threshold, which matters just as much: it is a hole you can walk
 * through and it has no element to represent it.
 */
export function scanOpenings(text: string): IfcOpeningScan {
  const index = guidIndex(text);

  const hostByOpening = new Map<LineRef, string>();
  for (const [, hostRef, openingRef] of text.matchAll(VOIDS)) {
    const hostGuid = resolveGuid(index, hostRef);
    if (hostGuid && openingRef) {
      hostByOpening.set(openingRef, hostGuid);
    }
  }

  const hostings: IfcHosting[] = [];
  const filled = new Set<LineRef>();
  for (const [, guid, openingRef, fillerRef] of text.matchAll(FILLS)) {
    if (openingRef) {
      filled.add(openingRef);
    }
    const hostGuid = openingRef ? hostByOpening.get(openingRef) : undefined;
    const fillerGuid = resolveGuid(index, fillerRef);
    if (guid && hostGuid && fillerGuid) {
      hostings.push({ guid, hostGuid, fillerGuid });
    }
  }

  const openPassages: IfcOpenPassage[] = [];
  for (const [openingRef, hostGuid] of hostByOpening) {
    if (filled.has(openingRef)) {
      continue;
    }
    const openingGuid = resolveGuid(index, openingRef);
    if (openingGuid) {
      openPassages.push({ hostGuid, openingGuid });
    }
  }

  return { hostings, openPassages };
}
