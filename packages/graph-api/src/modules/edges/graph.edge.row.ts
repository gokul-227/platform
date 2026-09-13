import type { RowPermitSource } from "@aec-craft/platform-authorization/nest";
import { graphEdge } from "../../database/schema";
import { GraphEdgeErrors } from "./graph.edge.errors";

/** Where a by-id edge route finds its scope: the row's own group. */
export const GRAPH_EDGE_ROW: RowPermitSource = {
  idParam: "edgeId",
  notFound: GraphEdgeErrors.NOT_FOUND,
  table: graphEdge,
};
