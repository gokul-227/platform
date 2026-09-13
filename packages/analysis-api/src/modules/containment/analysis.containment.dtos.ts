import {
  containmentInputSchema,
  containmentResponseSchema,
} from "@aec-craft/platform-contracts";
import { createZodDto } from "nestjs-zod";

export class AnalysisContainmentResponseDto extends createZodDto(
  containmentResponseSchema
) {}

export class RunAnalysisContainmentDto extends createZodDto(
  containmentInputSchema
) {}
