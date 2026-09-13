import { memoizePerRequest } from "@aec-craft/platform-authorization/nest";
import {
  AuthenticationErrors,
  PlatformError,
} from "@aec-craft/platform-contracts";
import type { Principal } from "@aec-craft/platform-id-resource-nestjs";
import { Inject, Injectable } from "@nestjs/common";
import { eq } from "drizzle-orm";
import { type Database, DatabaseToken } from "../database/database.module";
import { user } from "../database/schema";

/**
 * Authorization never needs this: a check runs against the subject the token
 * asserts. The profile surfaces do, because they are about the row rather than
 * the identity. Memoised per request.
 */
@Injectable()
export class PrincipalUserService {
  constructor(@Inject(DatabaseToken) private readonly db: Database) {}

  /**
   * A verified caller with no row means the registration webhook never fired,
   * which is not an authorization failure and must not read as one.
   */
  requireId(principal: Principal): Promise<string> {
    return memoizePerRequest(`user|${principal.subject}`, async () => {
      const rows = await this.db
        .select({ id: user.id })
        .from(user)
        .where(eq(user.externalId, principal.subject))
        .limit(1);
      const row = rows[0];
      if (!row) {
        throw new PlatformError(AuthenticationErrors.PRINCIPAL_NOT_PROVISIONED);
      }
      return row.id;
    });
  }
}
