import { type Scope, scopeSchema } from "../../common/scope";
/**
 * How a caller addresses a graph collection.
 *
 * Not a wire field: a collection names its scope in the path
 * (`/orgs/:orgId/graph/nodes`, `/projects/:projectId/graph/nodes`, and the
 * changeset at `/projects/:projectId/graph`), and a by-id op resolves it
 * server-side from the row's stored `(orgId, projectId)` columns. The same type
 * drives the SDK's single method per operation and the service's scope
 * parameter.
 */

import { z } from "zod";

export const graphScopeSchema = scopeSchema;
export type GraphScope = Scope;

/**
 * Only a project has two layers to narrow between, its own rows and the org
 * library it hydrates, so this is a project-list field. An org list has its
 * scope pinned already.
 */
export const scopeFilterSchema = z
  .enum(["project", "org"])
  .describe(
    "Narrow a project list. `project` returns project-only rows; `org` returns only the inherited org-scoped rows. Default is the full hydrated set. Not accepted on an org list."
  );
