import {
  createMemberInputSchema,
  memberListQuerySchema,
  memberListResponseSchema,
  memberResponseSchema,
  updateMemberInputSchema,
} from "@aec-craft/platform-contracts";
import { createZodDto } from "nestjs-zod";

/**
 * Declared here rather than imported from tenancy-api: a DTO class carries its zod
 * schema as metadata for one document, and this package publishes its own. Both
 * are built from the same contracts schema, so the shapes cannot drift.
 */
export class ListMembersDto extends createZodDto(memberListQuerySchema) {}

export class MemberListResponseDto extends createZodDto(
  memberListResponseSchema
) {}

export class MemberResponseDto extends createZodDto(memberResponseSchema) {}

export class CreateMemberDto extends createZodDto(createMemberInputSchema) {}

export class UpdateMemberDto extends createZodDto(updateMemberInputSchema) {}
