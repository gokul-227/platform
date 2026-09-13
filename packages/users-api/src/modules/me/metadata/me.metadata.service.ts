import type { UserResponse } from "@aec-craft/platform-contracts";
import { PlatformError } from "@aec-craft/platform-contracts";
import type { Principal } from "@aec-craft/platform-id-resource-nestjs";
import {
  deleteAtPath,
  type MetadataBag,
  MetadataStore,
  parseMetadataKeyPath,
  setAtPath,
} from "@aec-craft/platform-metadata";
import { Inject, Injectable } from "@nestjs/common";
import { PrincipalUserService } from "../../../common/principal.user.service";
import {
  type Database,
  DatabaseToken,
} from "../../../database/database.module";
import { user } from "../../../database/schema";
import { UserErrors } from "../../user.errors";
import { toUserResponse } from "../../user.service";

/**
 * Row-locked read-modify-write through `MetadataStore`, on the caller's own bag
 * and unaudited, like `PATCH /me`.
 */
@Injectable()
export class MeMetadataService {
  private readonly store: MetadataStore<typeof user>;

  constructor(
    @Inject(DatabaseToken) db: Database,
    @Inject(PrincipalUserService)
    private readonly principals: PrincipalUserService
  ) {
    this.store = new MetadataStore(db, {
      table: user,
      notFound: new PlatformError(UserErrors.NOT_FOUND),
    });
  }

  async set(
    principal: Principal,
    keyPath: string,
    value: unknown
  ): Promise<UserResponse> {
    const path = parseMetadataKeyPath(keyPath);
    return this.write(principal, (bag) => setAtPath(bag, path, value));
  }

  async delete(principal: Principal, keyPath: string): Promise<UserResponse> {
    const path = parseMetadataKeyPath(keyPath);
    return this.write(principal, (bag) => deleteAtPath(bag, path));
  }

  private async write(
    principal: Principal,
    mutate: (bag: MetadataBag) => MetadataBag
  ): Promise<UserResponse> {
    const userId = await this.principals.requireId(principal);
    const row = await this.store.write(userId, mutate);
    return toUserResponse(row);
  }
}
