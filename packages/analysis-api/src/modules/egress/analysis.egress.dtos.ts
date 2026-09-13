import {
  egressInputSchema,
  egressResponseSchema,
} from "@aec-craft/platform-contracts";
import { createZodDto } from "nestjs-zod";

export class AnalysisEgressResponseDto extends createZodDto(
  egressResponseSchema
) {}

export class RunAnalysisEgressDto extends createZodDto(egressInputSchema) {}
