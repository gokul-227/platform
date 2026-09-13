/**
 * The graph slice of the wire surface.
 *
 * Five concepts, in dependency order:
 *
 *   registry/   the kit a node type declares itself with: `defineBlock`,
 *               `defineEdge`, and the three structural types.
 *   shared/     what more than one type carries: the `lifecycle` and
 *               `provenance` blocks, and the one predicate and operator
 *               vocabulary that list filters, selectors and constraints share.
 *   object/     one folder per node type, each declaring its own class roots,
 *   rule/       blocks and edges and exporting a manifest. The rule for where an
 *   source/     edge belongs: **an edge files with the type at its `from` end.**
 *               No edge crosses between the document tree and the building: a
 *               rule reaches its targets through its selector and the binding is
 *               a verdict row. An edge whose two ends belong to different trees
 *               is a sign of two relations sharing one name; that is why
 *               `parentId` mirrors as `contains` for objects and `includes` for
 *               sources.
 *   vocabulary  composes the three manifests into the canonical lists, the
 *               classifier, and the `GRAPH_VOCABULARY` bundle. The only file
 *               that knows about all three types.
 *   wire/       what the API speaks: request and response schemas, filters and
 *               error catalogues, identical for every type.
 *
 * The model spec is docs/cognitive-building-model.md, the engine spec is
 * docs/graph.md.
 */
export * from "./object";
export * from "./query.spec";
export * from "./registry";
export * from "./rule";
export * from "./shared";
export * from "./source";
export * from "./vocabulary";
export * from "./wire";
