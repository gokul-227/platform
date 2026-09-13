import type {
  AdjacencyInput,
  AdjacencyResponse,
  ChokepointsInput,
  ChokepointsResponse,
  ConnectivityInput,
  ConnectivityResponse,
  ContainmentInput,
  ContainmentResponse,
  EgressInput,
  EgressResponse,
  QuantityInput,
  QuantityResponse,
  RatioInput,
  RatioResponse,
  RoutingInput,
  RoutingResponse,
} from "@aec-craft/platform-contracts";

import type { Http } from "../common/http";

/**
 * Named computations over a project's model. Every one is a `POST` because the
 * question is the body, not the URL, and every one needs `read` on the project's
 * group.
 *
 * Project-scoped only: an analysis reads the graph projection, which is a
 * project's, so there is no org-scoped counterpart to take a scope union for.
 *
 * Results are derived and disposable. Nothing here writes, so a stale answer is
 * re-asked rather than invalidated.
 */
export class AnalysisClient {
  constructor(private readonly http: Http) {}

  private run<T>(projectId: string, kind: string, input: unknown): Promise<T> {
    return this.http.post<T>(
      `/projects/${encodeURIComponent(projectId)}/analysis/${kind}`,
      input
    );
  }

  adjacency = (
    projectId: string,
    input: AdjacencyInput
  ): Promise<AdjacencyResponse> =>
    this.run<AdjacencyResponse>(projectId, "adjacency", input);

  chokepoints = (
    projectId: string,
    input: ChokepointsInput
  ): Promise<ChokepointsResponse> =>
    this.run<ChokepointsResponse>(projectId, "chokepoints", input);

  connectivity = (
    projectId: string,
    input: ConnectivityInput
  ): Promise<ConnectivityResponse> =>
    this.run<ConnectivityResponse>(projectId, "connectivity", input);

  containment = (
    projectId: string,
    input: ContainmentInput
  ): Promise<ContainmentResponse> =>
    this.run<ContainmentResponse>(projectId, "containment", input);

  egress = (projectId: string, input: EgressInput): Promise<EgressResponse> =>
    this.run<EgressResponse>(projectId, "egress", input);

  quantity = (
    projectId: string,
    input: QuantityInput
  ): Promise<QuantityResponse> =>
    this.run<QuantityResponse>(projectId, "quantity", input);

  ratio = (projectId: string, input: RatioInput): Promise<RatioResponse> =>
    this.run<RatioResponse>(projectId, "ratio", input);

  routing = (
    projectId: string,
    input: RoutingInput
  ): Promise<RoutingResponse> =>
    this.run<RoutingResponse>(projectId, "routing", input);
}
