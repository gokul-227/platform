import {
  adminCreateOrgInputSchema,
  orgListInputSchema,
  orgListResponseSchema,
  orgResponseSchema,
  updateOrgInputSchema,
} from "@aec-craft/platform-contracts";
import { createZodDto } from "nestjs-zod";

/**
 * Declared here rather than imported from tenancy-api: a DTO class carries its zod
 * schema as metadata for one document, and this package publishes its own. Both
 * are built from the same contracts schema, so the shapes cannot drift.
 */
export class CreateOrgDto extends createZodDto(adminCreateOrgInputSchema) {}

export class ListOrgsDto extends createZodDto(orgListInputSchema) {}

export class OrgListResponseDto extends createZodDto(orgListResponseSchema) {}

export class OrgResponseDto extends createZodDto(orgResponseSchema) {}

export class UpdateOrgDto extends createZodDto(updateOrgInputSchema) {}
