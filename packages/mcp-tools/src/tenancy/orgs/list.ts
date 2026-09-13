/**
 * `orgs_list` — `GET /orgs`.
 *
 * Lists organizations the caller can see. Supports the framework filter +
 * sort grammar (PostgREST `op.value`).
 */

import {
  orgFilters,
  orgListInputSchema,
  orgListResponseSchema,
} from "@aec-craft/platform-contracts";

import { defineTool } from "../../common/descriptor";

export const orgsListTool = defineTool({
  name: "orgs_list",
  description:
    "List organizations visible to the current user. Narrow with filters if " +
    "the result is large.",
  inputSchema: orgListInputSchema,
  outputSchema: orgListResponseSchema,
  resource: "api",
  endpoint: { method: "GET", path: "/orgs" },
  scopes: ["openid"],
  filterSpec: orgFilters,
});
