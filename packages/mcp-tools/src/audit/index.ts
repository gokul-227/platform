/**
 * Audit-domain tools. Composed into the package's root `ALL_TOOLS` list.
 *
 * Read-only by nature: the feed is written by the services that emit events,
 * never by a caller. One collection addressed by scope, matching apps/api.
 */

import type { ToolDescriptor } from "../common/descriptor";

import { auditGetTool } from "./get";
import { auditListTool } from "./list";

export * from "./get";
export * from "./list";

export const auditTools: readonly ToolDescriptor[] = [
  auditListTool,
  auditGetTool,
];
