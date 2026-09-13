import type { EntityMapping } from "@aec-craft/platform-cbm-engine";

import { node } from "../targets";

const MECHANISM = "architecture";

/**
 * The fabric you see: what encloses, divides, covers and connects space.
 *
 * Flat pairs because that is genuinely all these are. A wall is a wall; there
 * is no judgement to record, and writing each as an object would bury the few
 * entries that do carry one.
 *
 * A dot in a class means **is a kind of**, so `element.wall.curtain` is a wall
 * and a query for walls finds it. Parts are not spelled with a dot: a stair
 * flight is `element.stairFlight` and its relationship to the stair is an edge,
 * because a part is a relationship and pretending otherwise makes a query for
 * stairs count every flight as another stair.
 */
const PAIRS = [
  ["IfcWall", "element.wall"],
  // IFC's two wall types differ only in whether the profile is swept along a
  // path. Nothing downstream cares, so both are simply a wall.
  ["IfcWallStandardCase", "element.wall"],
  ["IfcSlab", "element.slab"],
  ["IfcRoof", "element.roof"],
  ["IfcDoor", "element.door"],
  ["IfcWindow", "element.window"],
  ["IfcCovering", "element.covering"],
  // A curtain wall is a wall: non-load-bearing and usually glazed, but it
  // encloses space and a query for walls should find it.
  ["IfcCurtainWall", "element.wall.curtain"],
  ["IfcPlate", "element.plate"],
  ["IfcStair", "element.stair"],
  ["IfcStairFlight", "element.stairFlight"],
  ["IfcRamp", "element.ramp"],
  ["IfcRampFlight", "element.rampFlight"],
  ["IfcRailing", "element.railing"],
  ["IfcChimney", "element.chimney"],
  ["IfcShadingDevice", "element.shadingDevice"],
] as const;

export const ARCHITECTURE_ENTITIES: EntityMapping[] = [
  ...PAIRS.map(
    ([source, cls]): EntityMapping => ({
      source,
      sourceType: "element",
      mechanism: MECHANISM,
      status: "partial",
      target: node(cls),
      fields: [{ from: "Name", to: "name" }],
    })
  ),
  {
    // The catch-all an authoring tool reaches for when nothing else fits. Kept
    // so the element still exists in the graph rather than vanishing, but its
    // class says exactly how much we know about it, which is nothing.
    source: "IfcBuildingElementProxy",
    sourceType: "element",
    mechanism: MECHANISM,
    status: "stub",
    target: node("element.proxy"),
    fields: [{ from: "Name", to: "name" }],
  },
  {
    // No IFC file contains one of these. The reader synthesises them for
    // doorless thresholds so that `connectsTo` has something passable to join
    // two rooms through. See openings/.
    source: "IfcVirtualElement",
    sourceType: "element",
    mechanism: MECHANISM,
    status: "full",
    target: node("element.virtual"),
    fields: [{ from: "Name", to: "name" }],
  },
];
