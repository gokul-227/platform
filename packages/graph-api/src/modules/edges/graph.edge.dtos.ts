import {
  getGraphEdgeQuerySchema,
  graphEdgeListInputSchema,
  graphEdgeListResponseSchema,
  graphEdgeResponseSchema,
  projectGraphEdgeListInputSchema,
} from "@aec-craft/platform-contracts";
import { createZodDto } from "nestjs-zod";

export class GetGraphEdgeQueryDto extends createZodDto(
  getGraphEdgeQuerySchema
) {}

export class ListGraphEdgesDto extends createZodDto(graphEdgeListInputSchema) {}

export class ListProjectGraphEdgesDto extends createZodDto(
  projectGraphEdgeListInputSchema
) {}

export class GraphEdgeListResponseDto extends createZodDto(
  graphEdgeListResponseSchema
) {}

export class GraphEdgeResponseDto extends createZodDto(
  graphEdgeResponseSchema
) {}
