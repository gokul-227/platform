/**
 * Threads-domain tools. Composed into the package's root `ALL_TOOLS` list.
 *
 * The thread itself lives at the top level (`list.ts`, `get.ts`, `create.ts`);
 * sub-resources (`messages/`, `runs/`) mirror the apps/api module structure.
 */

import type { ToolDescriptor } from "../common/descriptor";

import { threadsCreateTool } from "./create";
import { threadsGetTool } from "./get";
import { threadsListTool } from "./list";
import { threadMessageTools } from "./messages";
import { threadMetadataTools } from "./metadata";
import { threadRunTools } from "./runs";

export { threadsCreateTool } from "./create";
export { threadsGetTool } from "./get";
export { threadsListTool } from "./list";
export * from "./messages";
export * from "./metadata";
export * from "./runs";

export const threadTools: readonly ToolDescriptor[] = [
  threadsListTool,
  threadsGetTool,
  threadsCreateTool,
  ...threadMetadataTools,
  ...threadMessageTools,
  ...threadRunTools,
];
