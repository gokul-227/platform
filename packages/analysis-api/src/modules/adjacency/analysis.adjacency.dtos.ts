import {
  adjacencyInputSchema,
  adjacencyResponseSchema,
} from "@aec-craft/platform-contracts";
import { createZodDto } from "nestjs-zod";

export class AnalysisAdjacencyResponseDto extends createZodDto(
  adjacencyResponseSchema
) {}

export class RunAnalysisAdjacencyDto extends createZodDto(
  adjacencyInputSchema
) {}
