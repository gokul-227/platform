import {
  ratioInputSchema,
  ratioResponseSchema,
} from "@aec-craft/platform-contracts";
import { createZodDto } from "nestjs-zod";

export class AnalysisRatioResponseDto extends createZodDto(
  ratioResponseSchema
) {}

export class RunAnalysisRatioDto extends createZodDto(ratioInputSchema) {}
