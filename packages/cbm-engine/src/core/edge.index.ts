import type { WorkingEdge } from "./graph.working";

const NONE: readonly WorkingEdge[] = [];

function append<K, V>(map: Map<K, V[]>, key: K, value: V): void {
  const list = map.get(key);
  if (list) {
    list.push(value);
  } else {
    map.set(key, [value]);
  }
}

/**
 * Edges per endpoint, in one direction, kept twice: all of them, and a second
 * list per edge type.
 *
 * The per-type list is the point. Passes read typed edges inside per-node
 * loops, and filtering there allocates a copy on every call, which is what
 * dominates a run on a model of any size.
 *
 * Not called an adjacency: `adjacentTo` is a canonical edge type in this domain
 * meaning two spaces share a bounding wall, so the word is taken. It would also
 * be inaccurate, since an adjacency list maps a vertex to its neighbours and
 * this maps an endpoint to its edges.
 */
export class EdgeIndex {
  private readonly all = new Map<string, WorkingEdge[]>();
  private readonly byType = new Map<string, Map<string, WorkingEdge[]>>();

  add(endpoint: string, edge: WorkingEdge): void {
    append(this.all, endpoint, edge);

    let perType = this.byType.get(endpoint);
    if (!perType) {
      perType = new Map();
      this.byType.set(endpoint, perType);
    }
    append(perType, edge.type, edge);
  }

  get(endpoint: string, type?: string): readonly WorkingEdge[] {
    if (type === undefined) {
      return this.all.get(endpoint) ?? NONE;
    }
    return this.byType.get(endpoint)?.get(type) ?? NONE;
  }
}
