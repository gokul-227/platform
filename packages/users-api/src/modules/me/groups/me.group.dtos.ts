import {
  callerStandingListQuerySchema,
  callerStandingListResponseSchema,
} from "@aec-craft/platform-contracts";
import { createZodDto } from "nestjs-zod";

export class ListCallerStandingsDto extends createZodDto(
  callerStandingListQuerySchema
) {}
export class CallerStandingListResponseDto extends createZodDto(
  callerStandingListResponseSchema
) {}
