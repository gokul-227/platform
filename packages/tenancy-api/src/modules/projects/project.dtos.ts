import {
  createProjectInputSchema,
  projectListInputSchema,
  projectListResponseSchema,
  projectResponseSchema,
  updateProjectInputSchema,
} from "@aec-craft/platform-contracts";
import { createZodDto } from "nestjs-zod";

export class CreateProjectDto extends createZodDto(createProjectInputSchema) {}

export class ListProjectsDto extends createZodDto(projectListInputSchema) {}

export class ProjectListResponseDto extends createZodDto(
  projectListResponseSchema
) {}

export class ProjectResponseDto extends createZodDto(projectResponseSchema) {}

export class UpdateProjectDto extends createZodDto(updateProjectInputSchema) {}
