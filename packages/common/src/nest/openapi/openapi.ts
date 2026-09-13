import type { Type } from "@nestjs/common";

/**
 * One OpenAPI document per API package. Each package exports its spec; the
 * host app builds a document per spec (`include` bounds it to the package's
 * module tree) and composes them into the docs portal.
 */
export interface ApiDocumentSpec {
  /**
   * Modules whose routes the document includes. `deepScanRoutes` stops one
   * level past an entry, so a module nested deeper than that has to be named
   * here or its routes go undocumented.
   */
  include: Type<unknown>[];
  /** Mount path for the spec endpoints (`<path>`, `<path>.json`, `<path>.yaml`). */
  path: string;
  /**
   * Whether the host serves it. `false` builds and scans the document without
   * mounting an endpoint or a portal source, which is what an internal surface
   * needs: the conventions and validation gates read generated documents, so a
   * module in no document is checked by nothing. Defaults to served.
   */
  portal?: boolean;
  /** Label of this document's source in the docs portal switcher. */
  sourceTitle: string;
  tags: { description: string; name: string }[];
  title: string;
}

/**
 * Single source of truth for the list-filter wire grammar (PostgREST-style),
 * appended as a tag to every package document. Lives next to the filter
 * decorators that implement it.
 */
export const LIST_FILTER_TAG = {
  name: "Filtering, sorting and pagination",
  description: `List endpoints (\`GET /orgs\`, \`GET /orgs/:orgId/members\`, \`GET /graph/nodes\`, etc.) accept filters, sort, and pagination via query parameters using [PostgREST-style](https://docs.postgrest.org/en/stable/references/api/tables_views.html#horizontal-filtering) \`op.value\` syntax — a documented public convention, not a house grammar. PostgREST's own reference doubles as the instruction manual; the subset supported here is listed below.

## Filter grammar

\`?field=op.value\` — explicit operator prefix.
\`?field=value\` — bare-value shorthand, defaults to \`eq\`.
\`?field=in.(a,b,c)\` — set membership; parens are required.

Supported operators:

| Op | Use | Example |
|---|---|---|
| \`eq\` | exact match | \`?standing=eq.owner\` |
| \`ne\` | not equal | \`?standing=ne.viewer\` |
| \`gt\` / \`gte\` / \`lt\` / \`lte\` | comparison (numeric, date) | \`?createdAt=gte.2026-01-01\` |
| \`in\` / \`nin\` | set membership | \`?standing=in.(owner,manager)\` |
| \`like\` / \`ilike\` | raw SQL LIKE with \`%\` and \`_\` | \`?email=ilike.%example.com\` |
| \`startsWith\` / \`endsWith\` / \`contains\` | case-insensitive substring (auto-escaped) | \`?email=startsWith.marius\` |
| \`hasKey\` | JSONB key probe | \`?properties=hasKey.envelope\` |

Each parameter's documentation lists the operators allowed on that specific field. The examples dropdown on each query parameter shows a concrete value per allowed op — pick one to populate the field.

## JSONB paths

For JSONB-backed fields, walk into the structure with the Postgres arrow syntax in the query key:

\`\`\`
?properties->envelope->netArea=gte.5
?properties->envelope=hasKey.netArea
\`\`\`

## Sort

\`?sort=field:asc|desc\` — sort key. Repeat the parameter for multi-key sort; tokens are evaluated in order.

\`\`\`
?sort=joinedAt:desc&sort=email:asc
\`\`\`

The \`sort\` parameter on each endpoint lists which fields are sortable on that resource.

## Pagination

When pagination is enabled (cursor-based, opaque token), endpoints accept \`?limit=\` (default 50, max 200) and \`?cursor=\` and return a \`nextCursor\` in the response. Endpoints that haven't migrated to cursor pagination return plain arrays.

See \`docs/list-filter-framework.md\` in the repository for the full convention.`,
};
