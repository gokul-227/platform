/**
 * `projects_list` — `GET /projects`.
 *
 * Lists projects the caller can see across orgs. Same filter / sort grammar
 * as orgs, scoped to the user's accessible projects.
 */

import {
  projectFilters,
  projectListInputSchema,
  projectListResponseSchema,
} from "@aec-craft/platform-contracts";

import { defineTool } from "../../common/descriptor";

export const projectsListTool = defineTool({
  name: "projects_list",
  description:
    "List projects visible to the current user across all their orgs. " +
    "Each project carries its " +
    "`orgId` so the agent can regroup by org if needed.",
  inputSchema: projectListInputSchema,
  outputSchema: projectListResponseSchema,
  resource: "api",
  endpoint: { method: "GET", path: "/projects" },
  scopes: ["openid"],
  filterSpec: projectFilters,
});
