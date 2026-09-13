import { z } from "zod";
import { listInputSchema, listResponseSchema } from "../../query";

import { projectList } from "./project.filters";

const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;
const SLUG_RULES =
  "Lowercase letters, digits, and dashes; 1–64 characters; no leading or trailing dash.";

const metadataSchema = z
  .record(z.string(), z.unknown())
  .describe("Free-form key/value bag for arbitrary client data. Stored as-is.");

export const projectResponseSchema = z
  .object({
    id: z.string().uuid().describe("Stable project id."),
    orgId: z.string().uuid().describe("Parent organization id."),
    slug: z
      .string()
      .describe(
        `URL-safe handle, unique within the parent organization. ${SLUG_RULES}`
      ),
    name: z.string().describe("Display name."),
    metadata: metadataSchema,
    createdAt: z
      .string()
      .datetime()
      .describe("When the project was created (ISO 8601)."),
    updatedAt: z
      .string()
      .datetime()
      .describe("When the project was last updated (ISO 8601)."),
  })
  .describe("A project.");

export const createProjectInputSchema = z
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
    "Body for creating a project. You'll be added as its first owner; you must already be a member of the parent organization."
  );

export const updateProjectInputSchema = z
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
    "Body for updating a project. All fields are optional. Metadata is written through the " +
      "`/projects/:projectId/metadata/:keyPath` KV sub-resource, not here."
  );

export const projectListInputSchema = listInputSchema(projectList).describe(
  "Query for listing projects you belong to. Filter by `name`, `slug`, " +
    "`orgId`, `createdAt`, `updatedAt`; sort on offset pages. Default sort is " +
    "`name:asc`."
);

export const projectListResponseSchema = listResponseSchema(
  projectList,
  projectResponseSchema
).describe(
  "Paged project list. Cursor pages carry `nextCursor`; offset pages carry " +
    "`page`/`pageSize`/`total`/`totalPages`."
);

export type ProjectResponse = z.infer<typeof projectResponseSchema>;
export type CreateProjectInput = z.infer<typeof createProjectInputSchema>;
export type UpdateProjectInput = z.infer<typeof updateProjectInputSchema>;
export type ProjectListInput = z.infer<typeof projectListInputSchema>;
export type ProjectListResponse = z.infer<typeof projectListResponseSchema>;
