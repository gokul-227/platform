/**
 * Advisory leaf taxonomy: well-known `class` values in dot-notation.
 *
 * `class` accepts any dot-notation string; this documents the common vocabulary
 * and gives adapters shared mapping targets. Governance is advisory, not
 * enforced; a non-listed class succeeds and is counted as drift. Extend freely.
 *
 * The space leaves exist so an importer and a rule extractor aim at one
 * spelling: a rule selecting `space.kitchen` against a model that classified
 * kitchens as bare `space` binds to nothing, and a suggestion nobody published
 * is a suggestion both sides invent separately.
 *
 * A leaf is the durable typological kind, never the current use. A room whose
 * use changes keeps its class and moves `programme.use`, because a change of use
 * is an ordinary property write and must not be a re-classification.
 *
 * **A dot means "is a kind of".** `element.wall.curtain` is a wall, so a query
 * for the family finds it and a query for exactly `element.wall` does not.
 *
 * A dot never means "is a part of". Parts are edges: the spec's mereological
 * family (`hostedIn`, `interfaceOf`, containment) is where a part belongs, and
 * a part written as a class leaf would make a query for the whole count each
 * part as another whole. Compound nouns stay camelCase, so a stair flight is
 * `element.stairFlight` and not `element.stair.flight`.
 * The element leaves are the set `platform-cbm-ifc` maps onto, so the list and
 * the importer cannot disagree about a spelling. A format profile that needs a
 * leaf this list lacks adds it here in the same change, and `cbm-ifc` carries
 * the test that every class it emits is canonical: the check belongs there
 * because contracts must not depend on a format.
 */
export const CANONICAL_CLASSES = [
  "site",
  "building",
  "storey",
  "space",
  "space.kitchen",
  "space.bathroom",
  "space.wc",
  "space.bedroom",
  "space.living",
  "space.office",
  "space.circulation",
  "space.stair",
  "space.storage",
  "space.technical",
  "space.parking",
  "space.outdoor",
  "space.zone",
  "element.actuator",
  "element.airTerminal",
  "element.airTerminalBox",
  "element.beam",
  "element.boiler",
  "element.cable.segment",
  "element.cableCarrier.segment",
  "element.chiller",
  "element.chimney",
  "element.coil",
  "element.column",
  "element.covering",
  "element.door",
  "element.duct.fitting",
  "element.duct.segment",
  "element.fan",
  "element.footing",
  "element.furnishing",
  "element.furniture",
  "element.lightFixture",
  "element.member",
  "element.outlet",
  "element.pile",
  "element.pipe.fitting",
  "element.pipe.segment",
  "element.plate",
  "element.proxy",
  "element.pump",
  "element.railing",
  "element.ramp",
  "element.rampFlight",
  "element.roof",
  "element.sanitaryTerminal",
  "element.sensor",
  "element.shadingDevice",
  "element.slab",
  "element.spaceHeater",
  "element.stair",
  "element.stairFlight",
  "element.switch",
  "element.tank",
  "element.valve",
  "element.virtual",
  "element.wall",
  "element.wall.curtain",
  "element.window",
] as const;

export type CanonicalClass = (typeof CANONICAL_CLASSES)[number];
