/**
 * The analysis slice of the wire surface: one file per analysis, each declaring
 * the schemas that analysis speaks in and nothing else.
 *
 * Flat, and the routes are flat with it. A group is a classification and a path
 * is an identifier; classifications change, and reclassifying `connectivity` from
 * topology to circulation would have broken a route whose answer never moved.
 * Grouping lives in the OpenAPI tags, where being wrong costs one line.
 *
 * There is no shared result shape and no catalogue either. A connectivity answer
 * and a travel distance have nothing in common, and what can be computed is
 * described by the portal rather than by a route that lists it.
 */
export * from "./adjacency";
export * from "./chokepoints";
export * from "./connectivity";
export * from "./containment";
export * from "./egress";
export * from "./quantity";
export * from "./ratio";
export * from "./routing";
