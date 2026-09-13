import {
  chokepointsInputSchema,
  chokepointsResponseSchema,
} from "@aec-craft/platform-contracts";
import { createZodDto } from "nestjs-zod";

export class AnalysisChokepointsResponseDto extends createZodDto(
  chokepointsResponseSchema
) {}

export class RunAnalysisChokepointsDto extends createZodDto(
  chokepointsInputSchema
) {}
