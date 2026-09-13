import {
  getGraphNodeQuerySchema,
  graphNodeListInputSchema,
  graphNodeListResponseSchema,
  graphNodeResponseSchema,
  projectGraphNodeListInputSchema,
} from "@aec-craft/platform-contracts";
import { createZodDto } from "nestjs-zod";

export class GetGraphNodeQueryDto extends createZodDto(
  getGraphNodeQuerySchema
) {}

export class ListGraphNodesDto extends createZodDto(graphNodeListInputSchema) {}

export class ListProjectGraphNodesDto extends createZodDto(
  projectGraphNodeListInputSchema
) {}

export class GraphNodeListResponseDto extends createZodDto(
  graphNodeListResponseSchema
) {}

export class GraphNodeResponseDto extends createZodDto(
  graphNodeResponseSchema
) {}
