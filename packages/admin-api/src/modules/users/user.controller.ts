import { StaffGuard } from "@aec-craft/platform-authorization/nest";
import {
  ApiFilterQueries,
  ApiPaginationQueries,
  ApiPathParams,
  ApiPlatformErrors,
} from "@aec-craft/platform-common/nest";
import type {
  UserListResponse,
  UserResponse,
} from "@aec-craft/platform-contracts";
import {
  AuthenticationErrors,
  AuthorizationErrors,
  InternalErrors,
  userList,
  ValidationErrors,
} from "@aec-craft/platform-contracts";
import { UserErrors } from "@aec-craft/platform-users-api";
import { UserService } from "@aec-craft/platform-users-api/nest";
import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Query,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import {
  ListUsersDto,
  UserListResponseDto,
  UserResponseDto,
} from "./user.dtos";

/**
 * Reads, and one delete. The lifecycle belongs to the identity provider: a row
 * is created through the registration webhook, and removed here by the staff
 * console before it deletes the identity, so a last owner is refused while the
 * identity still exists. What somebody may do is a standing on a group.
 */
@ApiTags("Users")
@Controller("admin/users")
@UseGuards(StaffGuard)
@ApiBearerAuth("bearer")
@ApiPlatformErrors(
  AuthenticationErrors.PRINCIPAL_REQUIRED,
  AuthorizationErrors.STAFF_REQUIRED,
  InternalErrors.UNEXPECTED
)
export class AdminUserController {
  constructor(@Inject(UserService) private readonly users: UserService) {}

  @Get()
  @ApiOperation({
    summary: "List all users",
    description:
      "**Staff only.** Every user in the system. Default sort is `createdAt:asc`.",
  })
  @ApiResponse({ status: 200, type: UserListResponseDto })
  @ApiPlatformErrors(ValidationErrors.FAILED)
  @ApiFilterQueries(userList.filters)
  @ApiPaginationQueries(userList.pagination)
  list(@Query() query: ListUsersDto): Promise<UserListResponse> {
    return this.users.list(query);
  }

  @Get(":userId")
  @ApiPathParams("userId")
  @ApiOperation({
    summary: "Get a user",
    description: "**Staff only.** One user by id.",
  })
  @ApiResponse({ status: 200, type: UserResponseDto })
  @ApiPlatformErrors(UserErrors.NOT_FOUND)
  findById(@Param("userId") userId: string): Promise<UserResponse> {
    return this.users.findById(userId);
  }

  @Delete(":userId")
  @ApiPathParams("userId")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: "Delete a user",
    description:
      "**Staff only.** Removes the platform profile and every standing it holds. Refused while the person is the only owner of an organization or project; the blocking groups are listed in `details`, so ownership can be handed over first.",
  })
  @ApiResponse({ status: 204, description: "Profile removed" })
  @ApiPlatformErrors(UserErrors.NOT_FOUND, UserErrors.DELETE_BLOCKED_LAST_OWNER)
  delete(@Param("userId") userId: string): Promise<void> {
    return this.users.delete(userId);
  }
}
