import type {
  GraphNodeListInput,
  GraphNodeListResponse,
  GraphNodeResponse,
  Scope,
} from "@aec-craft/platform-contracts";
import type { Http } from "../common/http";
import { qs } from "../common/qs";
import { scopeQuery } from "../common/scope";

/**
 * The `object` slice of the graph: the things a building is made of.
 *
 * A facade over the same rows `client.graph.nodes` serves, narrowed to one node
 * type, so the envelope is the graph node one rather than a restatement of it.
 * Reads only; an object is written through `client.graph.apply`, because a
 * changeset is how the graph takes writes.
 */
export class ObjectClient {
  constructor(private readonly http: Http) {}

  list = (
    scope: Scope,
    query: Omit<GraphNodeListInput, "orgId" | "projectId"> = {}
  ): Promise<GraphNodeListResponse> =>
    this.http.get<GraphNodeListResponse>(
      `/objects${qs({ ...scopeQuery(scope), ...query })}`
    );

  findById = (objectId: string): Promise<GraphNodeResponse> =>
    this.http.get<GraphNodeResponse>(
      `/objects/${encodeURIComponent(objectId)}`
    );
}
