import type { GraphNodeResponse } from "@aec-craft/platform-contracts";

import { projectProperties } from "../graph.properties";

export interface GraphNodeRow {
  class: string;
  createdAt: Date;
  groupId: string;
  id: string;
  name: string;
  orgId: string;
  parentId: string | null;
  phase: string | null;
  projectId: string | null;
  properties: Record<string, unknown>;
  type: string;
  updatedAt: Date;
  version: string;
}

/**
 * The content fields covered by the skip-if-unchanged hash. Identity, scope,
 * version counter and timestamps deliberately excluded: a write that changes
 * none of these fields must hash equal to the stored state.
 */
export function nodeContent(dto: {
  type: string;
  class: string;
  name: string;
  parentId?: string | null | undefined;
  phase?: string | null | undefined;
  properties?: Record<string, unknown> | undefined;
}): Record<string, unknown> {
  return {
    type: dto.type,
    class: dto.class,
    name: dto.name,
    parentId: dto.parentId ?? null,
    phase: dto.phase ?? null,
    properties: dto.properties ?? {},
  };
}

export function toGraphNodeResponse(
  row: GraphNodeRow,
  projection?: string[]
): GraphNodeResponse {
  const { properties, propertyKeys } = projectProperties(
    row.properties,
    projection
  );
  return {
    id: row.id,
    orgId: row.orgId,
    projectId: row.projectId,
    type: row.type,
    class: row.class,
    name: row.name,
    version: row.version,
    parentId: row.parentId,
    phase: row.phase,
    properties,
    propertyKeys,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
