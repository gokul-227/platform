import type { GraphScope } from "@aec-craft/platform-contracts";
import { nodeTypeFromClass } from "@aec-craft/platform-contracts";
import type { WorkingEdge, WorkingNode } from "../core/graph.working";
import { edgeId, nodeId, scopeKeyOf } from "../core/id";
import type { SourceAdapter, SourceInstance } from "./source";
import type { EntityMapping, FieldRule, MappingTable, Target } from "./table";
import type { TransformRegistry } from "./transforms";

/** Decides a node's class from the instance, for entities whose class depends
 *  on data rather than on type alone. */
export type ClassResolver<I extends SourceInstance> = (instance: I) => string;

/**
 * Everything one run of the map stage needs.
 *
 * `build()` takes the same bag, because it does the same work and then
 * serialises. One declaration rather than two that drift.
 */
export interface MapOptions<I extends SourceInstance> {
  adapter: SourceAdapter<I>;
  /** Resolvers named by a target's `classFrom`. */
  classResolvers?: Record<string, ClassResolver<I>>;
  instances: readonly I[];
  map: MappingTable;
  scope: GraphScope;
  /** The file or connection this batch came from, stamped into `interop`. */
  source: string;
  transforms?: TransformRegistry;
}

export interface MapResult {
  edges: WorkingEdge[];
  nodes: WorkingNode[];
  /** Instances no entry claimed. Drift, counted rather than thrown. */
  unmapped: number;
}

/** Display names are bounded by the contract at 1..200 characters, and real
 *  models routinely carry empty or enormous ones. Neither may fail a batch. */
const NAME_LIMIT = 200;

/**
 * One run of the map stage.
 *
 * A class rather than a family of functions because every step needs the same
 * four things (the adapter, the table, the options, the scope key) and threading
 * them through each call is what made the previous shape read as a pile of
 * helpers. Constructed per run and thrown away; `run()` is the only entry.
 */
class Mapper<I extends SourceInstance> {
  private readonly entryFor: Map<string, EntityMapping>;
  private readonly scopeKey: string;

  private readonly nodes: WorkingNode[] = [];
  private readonly edges: WorkingEdge[] = [];
  private unmapped = 0;

  private readonly adapter: SourceAdapter<I>;

  constructor(private readonly options: MapOptions<I>) {
    this.adapter = options.adapter;
    this.entryFor = new Map(
      options.map.entries.map((entry) => [entry.source, entry])
    );
    this.scopeKey = scopeKeyOf(options.scope);
  }

  run(instances: readonly I[]): MapResult {
    for (const instance of instances) {
      this.take(instance);
    }
    return {
      nodes: this.nodes,
      edges: this.linkedEdges(),
      unmapped: this.unmapped,
    };
  }

  private take(instance: I): void {
    const entry = this.entryFor.get(instance.source);
    if (!entry) {
      this.unmapped += 1;
      return;
    }
    switch (entry.target.as) {
      case "ignored":
        return;
      case "edge":
        this.addEdges(instance, entry.target);
        return;
      default:
        this.nodes.push(this.toNode(instance, entry, entry.target));
    }
  }

  private addEdges(instance: I, target: Extract<Target, { as: "edge" }>): void {
    const { from, to } = this.adapter.endpoints(instance, target.endpoints);
    for (const start of from) {
      for (const end of to) {
        this.edges.push({
          id: edgeId(
            this.scopeKey,
            this.adapter.format,
            target.type,
            start,
            end
          ),
          sourceId: this.idOf(start),
          targetId: this.idOf(end),
          type: target.type,
          properties: {},
        });
      }
    }
  }

  private toNode(
    instance: I,
    entry: EntityMapping,
    target: Extract<Target, { as: "node" }>
  ): WorkingNode {
    const properties: Record<string, unknown> = {
      interop: {
        format: this.adapter.format,
        source: this.options.source,
        sourceId: instance.sourceId,
        sourceClass: instance.source,
      },
    };
    let name = instance.source;

    // Entity rules first, then the shared property layer, so a property rule
    // that also fires here wins over an entity default.
    for (const rule of [
      ...(entry.fields ?? []),
      ...(this.options.map.propertyRules ?? []),
    ]) {
      const value = this.resolve(instance, rule);
      if (value === undefined) {
        continue;
      }
      if (rule.to === "name") {
        name = String(value);
      } else {
        writePath(properties, rule.to, value);
      }
    }

    const cls = this.classOf(instance, target);
    return {
      id: this.idOf(instance.sourceId),
      type: nodeTypeFromClass(cls) ?? "object",
      class: cls,
      name: boundedName(name, instance.source),
      properties,
    };
  }

  /**
   * A rule's value, transformed. Undefined means write nothing.
   *
   * There is no default. A field the source did not state is absent, and
   * inventing a value for it would be indistinguishable downstream from one
   * the file actually carried.
   */
  private resolve(instance: I, rule: FieldRule): unknown {
    const value = this.adapter.resolve(instance, rule.from, rule.unit);
    if (value === undefined || value === null) {
      return;
    }
    const transform = rule.transform
      ? this.options.transforms?.[rule.transform]
      : undefined;
    return transform ? transform(value) : value;
  }

  private classOf(
    instance: I,
    target: Extract<Target, { as: "node" }>
  ): string {
    if (target.class) {
      return target.class;
    }
    if (!target.classFrom) {
      return "";
    }
    return this.options.classResolvers?.[target.classFrom]?.(instance) ?? "";
  }

  private idOf(sourceId: string): string {
    return nodeId(this.scopeKey, this.adapter.format, sourceId);
  }

  /**
   * Edges whose endpoints both became nodes.
   *
   * The mapped set is self-contained, so an endpoint outside it means that
   * entity had no entry. Keeping the edge would fail the whole changeset with
   * "endpoint not found"; dropping it is the honest outcome, and coverage names
   * the gap.
   */
  private linkedEdges(): WorkingEdge[] {
    const present = new Set(this.nodes.map((node) => node.id));
    return this.edges.filter(
      (edge) => present.has(edge.sourceId) && present.has(edge.targetId)
    );
  }
}

function boundedName(raw: string, fallback: string): string {
  const trimmed = raw.trim();
  return (trimmed.length > 0 ? trimmed : fallback).slice(0, NAME_LIMIT);
}

/** Write a dotted path, creating the intermediate objects. */
function writePath(
  into: Record<string, unknown>,
  path: string,
  value: unknown
): void {
  const parts = path.split(".");
  const leaf = parts.at(-1);
  if (!leaf) {
    return;
  }
  let cursor = into;
  for (const key of parts.slice(0, -1)) {
    const next = cursor[key];
    if (typeof next !== "object" || next === null) {
      cursor[key] = {};
    }
    cursor = cursor[key] as Record<string, unknown>;
  }
  cursor[leaf] = value;
}

/**
 * The map stage: source instances to working-graph nodes and edges.
 *
 * Anything unclaimed is counted and skipped rather than thrown, because an
 * unknown type is drift in the source, not a failure of the import.
 *
 * Every node is stamped with an `interop` backlink carrying the format, the
 * file and the source's own id and type. That is what makes a re-import
 * converge, what lets a viewer line a node up with its geometry, and what a
 * write-back would follow home.
 */
export function mapInstances<I extends SourceInstance>(
  options: MapOptions<I>
): MapResult {
  return new Mapper(options).run(options.instances);
}
