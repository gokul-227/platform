import {
  updateUserInputSchema,
  userListInputSchema,
  userListResponseSchema,
  userResponseSchema,
} from "@aec-craft/platform-contracts";
import { createZodDto } from "nestjs-zod";

export class UpdateUserDto extends createZodDto(updateUserInputSchema) {}

export class ListUsersDto extends createZodDto(userListInputSchema) {}

export class UserListResponseDto extends createZodDto(userListResponseSchema) {}

export class UserResponseDto extends createZodDto(userResponseSchema) {}
