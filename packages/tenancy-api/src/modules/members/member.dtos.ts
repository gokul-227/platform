import {
  createMemberInputSchema,
  memberListQuerySchema,
  memberListResponseSchema,
  memberResponseSchema,
  updateMemberInputSchema,
} from "@aec-craft/platform-contracts";
import { createZodDto } from "nestjs-zod";

export class ListMembersDto extends createZodDto(memberListQuerySchema) {}
export class MemberListResponseDto extends createZodDto(
  memberListResponseSchema
) {}
export class MemberResponseDto extends createZodDto(memberResponseSchema) {}
export class CreateMemberDto extends createZodDto(createMemberInputSchema) {}
export class UpdateMemberDto extends createZodDto(updateMemberInputSchema) {}
