/**
 * Projects-domain tools. Composed into the package's root `ALL_TOOLS` list.
 *
 * Membership has no tool, for the reason the org tools give.
 */

import type { ToolDescriptor } from "../../common/descriptor";

import { projectsCreateTool } from "./create";
import { projectsGetTool } from "./get";
import { projectsListTool } from "./list";
import { projectMetadataTools } from "./metadata";
import { projectsUpdateTool } from "./update";

export { projectsCreateTool } from "./create";
export { projectsGetTool } from "./get";
export { projectsListTool } from "./list";
export * from "./metadata";
export { projectsUpdateTool } from "./update";

export const projectTools: readonly ToolDescriptor[] = [
  projectsListTool,
  projectsGetTool,
  projectsCreateTool,
  projectsUpdateTool,
  ...projectMetadataTools,
];
