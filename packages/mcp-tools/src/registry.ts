/**
 * The full list of MCP tools shipped by `@aec-craft/platform-mcp-tools`.
 *
 * Composed from per-domain folders mirroring apps/api's `modules/` layout.
 * Each domain index re-exports its own descriptors + sub-domain arrays via
 * `export *`; this file is just the final union.
 */

import { auditTools } from "./audit";
import type { ToolDescriptor } from "./common/descriptor";
import { fileTools } from "./files";
import { graphTools } from "./graph";
import { orgTools } from "./tenancy/orgs";
import { projectTools } from "./tenancy/projects";
import { threadTools } from "./threads";
import { userTools } from "./users";

export * from "./audit";
export * from "./files";
export * from "./graph";
export * from "./tenancy/orgs";
export * from "./tenancy/projects";
export * from "./threads";
export * from "./users";

export const ALL_TOOLS: readonly ToolDescriptor[] = [
  ...auditTools,
  ...fileTools,
  ...graphTools,
  ...orgTools,
  ...projectTools,
  ...threadTools,
  ...userTools,
];
