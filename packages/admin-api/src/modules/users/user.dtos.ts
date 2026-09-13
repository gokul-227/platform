import {
  userListInputSchema,
  userListResponseSchema,
  userResponseSchema,
} from "@aec-craft/platform-contracts";
import { createZodDto } from "nestjs-zod";

/**
 * Declared here rather than imported from users-api: a DTO class carries its zod
 * schema as metadata for one document, and this package publishes its own. Both
 * are built from the same contracts schema, so the shapes cannot drift.
 */
export class ListUsersDto extends createZodDto(userListInputSchema) {}

export class UserListResponseDto extends createZodDto(userListResponseSchema) {}

export class UserResponseDto extends createZodDto(userResponseSchema) {}
