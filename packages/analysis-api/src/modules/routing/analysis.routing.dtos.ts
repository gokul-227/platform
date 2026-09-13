import {
  routingInputSchema,
  routingResponseSchema,
} from "@aec-craft/platform-contracts";
import type { SchemaObject } from "@nestjs/swagger/dist/interfaces/open-api-spec.interface";
import { createZodDto, zodToOpenAPI } from "nestjs-zod";

export const ANALYSIS_ROUTING_RESPONSE_SCHEMA: SchemaObject = zodToOpenAPI(
  routingResponseSchema
) as SchemaObject;

export class RunAnalysisRoutingDto extends createZodDto(routingInputSchema) {}
