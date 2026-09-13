import type { GraphEdgeResponse } from "@aec-craft/platform-contracts";

import { projectProperties } from "../graph.properties";

export interface GraphEdgeRow {
  createdAt: Date;
  groupId: string;
  id: string;
  orgId: string;
  projectId: string | null;
  properties: Record<string, unknown>;
  sourceId: string;
  targetId: string;
  type: string;
  updatedAt: Date;
  version: string;
}

/**
 * What the skip-if-unchanged hash covers. Endpoints are immutable but part of
 * the edge's content identity; the version counter and timestamps stay out.
 */
export function edgeContent(dto: {
  sourceId: string;
  targetId: string;
  type: string;
  properties?: Record<string, unknown> | undefined;
}): Record<string, unknown> {
  return {
    sourceId: dto.sourceId,
    targetId: dto.targetId,
    type: dto.type,
    properties: dto.properties ?? {},
  };
}

export function toGraphEdgeResponse(
  row: GraphEdgeRow,
  projection?: string[]
): GraphEdgeResponse {
  const { properties, propertyKeys } = projectProperties(
    row.properties,
    projection
  );
  return {
    id: row.id,
    orgId: row.orgId,
    projectId: row.projectId,
    sourceId: row.sourceId,
    targetId: row.targetId,
    type: row.type,
    version: row.version,
    properties,
    propertyKeys,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
