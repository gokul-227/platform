/**
 * `@aec-craft/platform-mcp-tools` — typed MCP tool descriptors + manifest helpers.
 *
 * - `ToolDescriptor` / `defineTool` declare what a single tool looks like.
 * - Per-domain folders (tenancy / users / graph / threads / ...) mirror the
 *   platform's domain vocabulary. Each folder's `index.ts` exports a
 *   `<domain>Tools` array; `registry.ts` composes them into `ALL_TOOLS`.
 *   Adding a tool is a single new file under the right domain folder.
 * - `buildToolsListPayload` converts the descriptor list to the MCP `tools/list`
 *   wire shape (JSON Schema for inputs).
 *
 * Consumers: the `/mcp` endpoint in `apps/api` (primary), and any tooling that
 * wants to introspect the manifest (codegen, docs).
 */

export {
  defineTool,
  type Endpoint,
  type HttpMethod,
  type ResourceId,
  type ToolDescriptor,
} from "./common/descriptor";

export {
  buildToolsListPayload,
  describeFilterSpec,
  descriptorToManifestEntry,
  type McpToolManifestEntry,
  type McpToolsListPayload,
} from "./common/manifest";

export * from "./registry";
