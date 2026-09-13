import type { RowPermitSource } from "@aec-craft/platform-authorization/nest";
import { graphNode } from "../../database/schema";
import { GraphNodeErrors } from "./graph.node.errors";

/** Where a by-id node route finds its scope: the row's own group. */
export const GRAPH_NODE_ROW: RowPermitSource = {
  idParam: "nodeId",
  notFound: GraphNodeErrors.NOT_FOUND,
  table: graphNode,
};
