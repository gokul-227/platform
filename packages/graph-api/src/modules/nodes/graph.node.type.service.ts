import type {
  GraphNodeListResponse,
  GraphNodeResponse,
  Permit,
  PlatformErrorSpec,
  ProjectGraphNodeListInput,
  ResolvedScope,
} from "@aec-craft/platform-contracts";
import { PlatformError } from "@aec-craft/platform-contracts";
import type { Principal } from "@aec-craft/platform-id-resource-nestjs";
import { GraphNodeErrors } from "./graph.node.errors";
import type { GraphNodeService } from "./graph.node.service";

/**
 * A facade rather than a second implementation: the graph slice owns the
 * scoping, filters, cursor and projection, and a copy of any of them drifts.
 * What a subclass adds is the type narrowing, applied to the query before it
 * runs rather than to the rows after, so `?type=` cannot widen it.
 */
export abstract class GraphNodeTypeService {
  /** The one node type this resource presents. */
  protected abstract readonly nodeType: string;
  /** Letting `GRAPH_NODE_NOT_FOUND` through would describe the store. */
  protected abstract readonly notFound: PlatformErrorSpec;

  constructor(protected readonly nodes: GraphNodeService) {}

  list(
    scope: ResolvedScope,
    query: ProjectGraphNodeListInput,
    readable: readonly string[]
  ): Promise<GraphNodeListResponse> {
    return this.nodes.list(scope, { ...query, type: this.nodeType }, readable);
  }

  /**
   * Wrapped rather than called from the controller: the authorization read
   * misses on the same absent row, so one translation covers both and no path
   * out of a facade names `graph_node`.
   */
  async authorize(
    principal: Principal,
    nodeId: string,
    permit: Permit
  ): Promise<ResolvedScope> {
    return await this.translate(() =>
      this.nodes.authorizeById(principal, nodeId, permit)
    );
  }

  /**
   * A node of another type answers not-found: telling "exists but is another
   * type" from "does not exist" is a map of what exists. Checked after the read,
   * because the type is on the row.
   */
  async findById(
    scope: ResolvedScope,
    nodeId: string,
    projection?: string[]
  ): Promise<GraphNodeResponse> {
    const node = await this.read(scope, nodeId, projection);
    if (node.type !== this.nodeType) {
      throw new PlatformError(this.notFound);
    }
    return node;
  }

  private read(
    scope: ResolvedScope,
    nodeId: string,
    projection?: string[]
  ): Promise<GraphNodeResponse> {
    return this.translate(() => this.nodes.findById(scope, nodeId, projection));
  }

  /** `GRAPH_NODE_NOT_FOUND` in, this resource's own miss out. */
  private async translate<T>(read: () => Promise<T>): Promise<T> {
    try {
      return await read();
    } catch (error) {
      if (
        error instanceof PlatformError &&
        error.code === GraphNodeErrors.NOT_FOUND.code
      ) {
        throw new PlatformError(this.notFound);
      }
      throw error;
    }
  }
}
