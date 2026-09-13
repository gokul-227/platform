import { z } from "zod";
import { listInputSchema, listResponseSchema } from "../../query";

import { orgList } from "./org.filters";

const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;
const SLUG_RULES =
  "Lowercase letters, digits, and dashes; 1–64 characters; no leading or trailing dash.";

const metadataSchema = z
  .record(z.string(), z.unknown())
  .describe("Free-form key/value bag for arbitrary client data. Stored as-is.");

export const orgResponseSchema = z
  .object({
    id: z.string().uuid().describe("Stable organization id."),
    slug: z.string().describe(`URL-safe handle. ${SLUG_RULES}`),
    name: z.string().describe("Display name."),
    metadata: metadataSchema,
    createdAt: z
      .string()
      .datetime()
      .describe("When the organization was created (ISO 8601)."),
    updatedAt: z
      .string()
      .datetime()
      .describe("When the organization was last updated (ISO 8601)."),
  })
  .describe("An organization.");

export const createOrgInputSchema = z
  .object({
    name: z
      .string()
      .min(1)
      .max(100)
      .describe("Display name. 1–100 characters."),
    slug: z
      .string()
      .min(1)
      .max(64)
      .regex(SLUG_PATTERN)
      .optional()
      .describe(
        `Optional URL-safe handle. ${SLUG_RULES} If you don't provide one, it's derived from the name.`
      ),
    metadata: metadataSchema.optional(),
  })
  .describe(
    "Body for creating an organization. You'll be added as its first owner."
  );

/**
 * The staff surface names the owner instead of becoming one. Required, and no
 * default: an organization with no owner can be administered by nobody, and the
 * caller is not a candidate — a staff admin setting a customer up has no business
 * on their roster.
 */
export const adminCreateOrgInputSchema = createOrgInputSchema
  .extend({
    ownerEmail: z
      .string()
      .email()
      .describe(
        "Who owns it. Must be somebody who has signed in at least once; an address the platform has never seen is refused rather than invited."
      ),
  })
  .describe(
    "Body for creating an organization on somebody's behalf. They become its first owner; you are not added to it."
  );

export const updateOrgInputSchema = z
  .object({
    name: z.string().min(1).max(100).optional().describe("Display name."),
    slug: z
      .string()
      .min(1)
      .max(64)
      .regex(SLUG_PATTERN)
      .optional()
      .describe(`Replacement handle. ${SLUG_RULES}`),
  })
  .describe(
    "Body for updating an organization. All fields are optional. Metadata is written through " +
      "the `/orgs/:orgId/metadata/:keyPath` KV sub-resource, not here."
  );

export const orgListInputSchema = listInputSchema(orgList).describe(
  "Query for listing organizations. PostgREST-style `op.value` filters " +
    "(`?name=startsWith.acme`, `?createdAt=gte.2026-01-01`), repeatable " +
    "`?sort=field:asc|desc` on offset pages, and `page`/`pageSize` or " +
    "`limit`/`cursor` paging."
);

export const orgListResponseSchema = listResponseSchema(
  orgList,
  orgResponseSchema
).describe(
  "Paged organization list. Cursor pages carry `nextCursor`; offset pages " +
    "carry `page`/`pageSize`/`total`/`totalPages`."
);

export type OrgResponse = z.infer<typeof orgResponseSchema>;
export type AdminCreateOrgInput = z.infer<typeof adminCreateOrgInputSchema>;
export type CreateOrgInput = z.infer<typeof createOrgInputSchema>;
export type UpdateOrgInput = z.infer<typeof updateOrgInputSchema>;
export type OrgListInput = z.infer<typeof orgListInputSchema>;
export type OrgListResponse = z.infer<typeof orgListResponseSchema>;
