import {
  quantityInputSchema,
  quantityResponseSchema,
} from "@aec-craft/platform-contracts";
import type { SchemaObject } from "@nestjs/swagger/dist/interfaces/open-api-spec.interface";
import { createZodDto, zodToOpenAPI } from "nestjs-zod";

export const ANALYSIS_QUANTITY_RESPONSE_SCHEMA: SchemaObject = zodToOpenAPI(
  quantityResponseSchema
) as SchemaObject;

export class RunAnalysisQuantityDto extends createZodDto(quantityInputSchema) {}
