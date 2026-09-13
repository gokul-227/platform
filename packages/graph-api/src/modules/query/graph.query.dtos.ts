import {
  cypherQueryInputSchema,
  cypherQueryResponseSchema,
  graphHealthResponseSchema,
  projectScopeQuerySchema,
} from "@aec-craft/platform-contracts";
import { createZodDto } from "nestjs-zod";

export class CypherQueryResponseDto extends createZodDto(
  cypherQueryResponseSchema
) {}

export class GraphHealthResponseDto extends createZodDto(
  graphHealthResponseSchema
) {}

export class RunCypherQueryDto extends createZodDto(cypherQueryInputSchema) {}

/** The Cypher surface is project-only: the projection is queried through `$projectId`. */
export class ProjectScopeQueryDto extends createZodDto(
  projectScopeQuerySchema
) {}
