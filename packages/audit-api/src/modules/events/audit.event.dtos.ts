import {
  auditEventGetInputSchema,
  auditEventListInputSchema,
  auditEventListResponseSchema,
  auditEventResponseSchema,
} from "@aec-craft/platform-contracts";
import { createZodDto } from "nestjs-zod";

export class GetAuditEventDto extends createZodDto(auditEventGetInputSchema) {}

export class ListAuditEventsDto extends createZodDto(
  auditEventListInputSchema
) {}

export class AuditEventListResponseDto extends createZodDto(
  auditEventListResponseSchema
) {}

export class AuditEventResponseDto extends createZodDto(
  auditEventResponseSchema
) {}
