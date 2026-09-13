import { firstRowOrThrow } from "@aec-craft/platform-common/drizzle";
import type { UserResponse } from "@aec-craft/platform-contracts";
import { PlatformError } from "@aec-craft/platform-contracts";
import type { Principal } from "@aec-craft/platform-id-resource-nestjs";
import { Inject, Injectable } from "@nestjs/common";
import { eq } from "drizzle-orm";
import { PrincipalUserService } from "../../common/principal.user.service";
import { type Database, DatabaseToken } from "../../database/database.module";
import { user } from "../../database/schema";
import type { UpdateUserDto } from "../user.dtos";
import { UserErrors } from "../user.errors";
import { toUserResponse, UserService } from "../user.service";

/**
 * The row is resolved from the subject the token asserts, which is the one place
 * the platform's user id and the identity id meet.
 */
@Injectable()
export class MeService {
  constructor(
    @Inject(DatabaseToken) private readonly db: Database,
    @Inject(UserService) private readonly users: UserService,
    @Inject(PrincipalUserService)
    private readonly principals: PrincipalUserService
  ) {}

  async get(principal: Principal): Promise<UserResponse> {
    return await this.users.findById(
      await this.principals.requireId(principal)
    );
  }

  async update(
    principal: Principal,
    dto: UpdateUserDto
  ): Promise<UserResponse> {
    const userId = await this.principals.requireId(principal);
    // Only what the platform owns. `name` and `email` belong to the identity
    // and arrive through the provider's webhook; accepting them here too would
    // mean two writers for one column and a last-fire-wins race between them.
    const patch: Partial<typeof user.$inferInsert> = {
      updatedAt: new Date(),
    };
    if (dto.picture !== undefined) {
      patch.picture = dto.picture;
    }

    const rows = await this.db
      .update(user)
      .set(patch)
      .where(eq(user.id, userId))
      .returning();
    const row = firstRowOrThrow(
      rows,
      () =>
        new PlatformError(UserErrors.NOT_FOUND, `User '${userId}' not found`)
    );
    return toUserResponse(row);
  }
}
