import { deepMerge } from "./deep-merge";
import { EdgeIndex } from "./edge.index";

/**
 * The working graph: the one materialisation between mapping and upload.
 *
 * The map stage writes these objects, derive passes mutate them in place, and
 * the changeset serialises the same objects. There is no copy at any stage, so
 * an enriched node *is* the uploaded node.
 *
 * Named `Working*` rather than `Graph*` because three different things would
 * otherwise share one name: `platform-contracts` has `GraphNodeOp`, a wire
 * operation, and `platform-graph-api` has `GraphNodeRow`, what is persisted.
 * The differences are real. Here an id is always present because it is derived,
 * properties are always present because `interop` is, and there is no `op`
 * because nothing has been decided yet.
 */
export interface WorkingNode {
  class: string;
  id: string;
  name: string;
  properties: Record<string, unknown>;
  type: string;
}

/**
 * A mapped edge arrives with a derived id. A derived edge omits it and the
 * changeset stamps one from the endpoints, which reaches the same value.
 */
export interface WorkingEdge {
  id?: string;
  properties?: Record<string, unknown>;
  sourceId: string;
  targetId: string;
  type: string;
}

const NO_NODES: readonly WorkingNode[] = [];

/**
 * An indexed, mutable view over the mapped graph.
 *
 * Built once in O(V + E). Every read is O(1) or O(matches) and hands back the
 * internal list rather than a copy, which the `readonly` return type is the
 * contract for. A derived edge is indexed the moment it is added, so a later
 * pass sees what an earlier pass produced.
 *
 * The constructor adopts both arrays; afterwards the graph owns them.
 */
export class WorkingGraph {
  readonly nodes: WorkingNode[];
  readonly edges: WorkingEdge[];

  private readonly byId = new Map<string, WorkingNode>();
  private readonly byClass = new Map<string, WorkingNode[]>();
  private readonly outgoing = new EdgeIndex();
  private readonly incoming = new EdgeIndex();
  private readonly derived: WorkingEdge[] = [];
  private patches = 0;

  constructor(nodes: WorkingNode[], edges: WorkingEdge[]) {
    this.nodes = nodes;
    this.edges = edges;
    for (const node of nodes) {
      this.byId.set(node.id, node);
      const sameClass = this.byClass.get(node.class);
      if (sameClass) {
        sameClass.push(node);
      } else {
        this.byClass.set(node.class, [node]);
      }
    }
    for (const edge of edges) {
      this.index(edge);
    }
  }

  // ── reading nodes ──────────────────────────────────────────────────────────

  node(id: string): WorkingNode | undefined {
    return this.byId.get(id);
  }

  /** Nodes whose class is exactly this. No copy. */
  nodesOfClass(cls: string): readonly WorkingNode[] {
    return this.byClass.get(cls) ?? NO_NODES;
  }

  /**
   * Nodes in a class family: the class itself or a dot-scoped descendant, so
   * `element.wall` matches `element.wall.curtain` but never `element.wallish`.
   * Iterates the distinct classes, a small set, rather than every node.
   */
  nodesInFamily(family: string): WorkingNode[] {
    const prefix = `${family}.`;
    const found: WorkingNode[] = [];
    for (const [cls, nodes] of this.byClass) {
      if (cls === family || cls.startsWith(prefix)) {
        found.push(...nodes);
      }
    }
    return found;
  }

  // ── reading edges ──────────────────────────────────────────────────────────

  edgesFrom(id: string, type?: string): readonly WorkingEdge[] {
    return this.outgoing.get(id, type);
  }

  edgesTo(id: string, type?: string): readonly WorkingEdge[] {
    return this.incoming.get(id, type);
  }

  /**
   * Everything reachable outward along one edge type, breadth first.
   *
   * The frontier array doubles as the queue: `for...of` observes appends, so
   * the walk stays linear with nothing shifted off the head.
   */
  descendants(id: string, type: string): WorkingNode[] {
    const seen = new Set<string>([id]);
    const found: WorkingNode[] = [];
    const frontier = [id];
    for (const current of frontier) {
      for (const edge of this.edgesFrom(current, type)) {
        if (seen.has(edge.targetId)) {
          continue;
        }
        seen.add(edge.targetId);
        const node = this.byId.get(edge.targetId);
        if (node) {
          found.push(node);
        }
        frontier.push(edge.targetId);
      }
    }
    return found;
  }

  // ── writing ────────────────────────────────────────────────────────────────

  /** Add a derived edge. Indexed immediately, so later passes can read it. */
  addEdge(edge: WorkingEdge): void {
    this.index(edge);
    this.edges.push(edge);
    this.derived.push(edge);
  }

  /**
   * Merge into a node's properties, in place. The patch is adopted by
   * reference, so pass a fresh object per call.
   */
  patch(id: string, patch: Record<string, unknown>): void {
    const node = this.byId.get(id);
    if (!node) {
      return;
    }
    deepMerge(node.properties, patch);
    this.patches += 1;
  }

  // ── what happened ──────────────────────────────────────────────────────────

  /** The edges the derive stage added, a suffix of `edges`. */
  derivedEdges(): readonly WorkingEdge[] {
    return this.derived;
  }

  /** How many patches have been applied, for per-pass reporting. */
  get patchCount(): number {
    return this.patches;
  }

  // ── internals ──────────────────────────────────────────────────────────────

  private index(edge: WorkingEdge): void {
    this.outgoing.add(edge.sourceId, edge);
    this.incoming.add(edge.targetId, edge);
  }
}
