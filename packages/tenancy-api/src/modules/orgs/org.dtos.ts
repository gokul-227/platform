import {
  createOrgInputSchema,
  orgListInputSchema,
  orgListResponseSchema,
  orgResponseSchema,
  updateOrgInputSchema,
} from "@aec-craft/platform-contracts";
import { createZodDto } from "nestjs-zod";

export class CreateOrgDto extends createZodDto(createOrgInputSchema) {}

export class ListOrgsDto extends createZodDto(orgListInputSchema) {}

export class OrgListResponseDto extends createZodDto(orgListResponseSchema) {}

export class OrgResponseDto extends createZodDto(orgResponseSchema) {}

export class UpdateOrgDto extends createZodDto(updateOrgInputSchema) {}
