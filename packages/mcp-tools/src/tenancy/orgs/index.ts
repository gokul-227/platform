/**
 * Orgs-domain tools. Composed into the package's root `ALL_TOOLS` list.
 *
 * Membership has no tool: `/orgs/:orgId/members` is a person's surface, and an
 * agent handing out standings is not something to make easy.
 */

import type { ToolDescriptor } from "../../common/descriptor";

import { orgsGetTool } from "./get";
import { orgsListTool } from "./list";
import { orgMetadataTools } from "./metadata";

export { orgsGetTool } from "./get";
export { orgsListTool } from "./list";
export * from "./metadata";

export const orgTools: readonly ToolDescriptor[] = [
  orgsListTool,
  orgsGetTool,
  ...orgMetadataTools,
];
