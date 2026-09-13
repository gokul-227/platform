import {
  graphBatchInputSchema,
  graphBatchResponseSchema,
  scopeQuerySchema,
} from "@aec-craft/platform-contracts";
import { createZodDto } from "nestjs-zod";

export class ApplyGraphBatchDto extends createZodDto(graphBatchInputSchema) {}

export class GraphBatchResponseDto extends createZodDto(
  graphBatchResponseSchema
) {}

/** The scope a changeset lands in: exactly one of `orgId` or `projectId`. */
export class GraphScopeQueryDto extends createZodDto(scopeQuerySchema) {}
