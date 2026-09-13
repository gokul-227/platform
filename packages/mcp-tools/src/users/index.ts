/**
 * Users-domain tools. Composed into the package's root `ALL_TOOLS` list.
 *
 * v1 ships only the self-targeted `me_*` tools (the agent's own identity),
 * which live under `me/` mirroring the apps/api module structure. Admin user
 * routes (`GET /users`, etc.) are intentionally not exposed — agent surfaces
 * don't enumerate platform-wide user lists; that's staff console territory.
 */

import type { ToolDescriptor } from "../common/descriptor";

import { meTools } from "./me";

export * from "./me";

export const userTools: readonly ToolDescriptor[] = [...meTools];
