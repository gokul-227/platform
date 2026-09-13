import {
  connectivityInputSchema,
  connectivityResponseSchema,
} from "@aec-craft/platform-contracts";
import type { SchemaObject } from "@nestjs/swagger/dist/interfaces/open-api-spec.interface";
import { createZodDto, zodToOpenAPI } from "nestjs-zod";

export const ANALYSIS_CONNECTIVITY_RESPONSE_SCHEMA: SchemaObject = zodToOpenAPI(
  connectivityResponseSchema
) as SchemaObject;

export class RunAnalysisConnectivityDto extends createZodDto(
  connectivityInputSchema
) {}
