import {
  projectListInputSchema,
  projectListResponseSchema,
  projectResponseSchema,
  updateProjectInputSchema,
} from "@aec-craft/platform-contracts";
import { createZodDto } from "nestjs-zod";

/**
 * Declared here rather than imported from tenancy-api: a DTO class carries its zod
 * schema as metadata for one document, and this package publishes its own. Both
 * are built from the same contracts schema, so the shapes cannot drift.
 */
export class ListProjectsDto extends createZodDto(projectListInputSchema) {}

export class ProjectListResponseDto extends createZodDto(
  projectListResponseSchema
) {}

export class ProjectResponseDto extends createZodDto(projectResponseSchema) {}

export class UpdateProjectDto extends createZodDto(updateProjectInputSchema) {}
