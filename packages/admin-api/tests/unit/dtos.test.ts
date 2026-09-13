import {
  orgListInputSchema,
  updateOrgInputSchema,
  userListInputSchema,
} from "@aec-craft/platform-contracts";
import { describe, expect, it } from "vitest";

import { ListOrgsDto, UpdateOrgDto } from "../../src/modules/orgs/org.dtos";
import { ListUsersDto } from "../../src/modules/users/user.dtos";

/**
 * The DTO classes are declared here rather than imported from the packages that
 * own the rows, because a class carries its schema as metadata for one document.
 * What that buys is only safe while both sides are built from the same contracts
 * schema, so that is what this asserts.
 */
describe("the admin DTOs mirror the owning package's schema", () => {
  it("lists orgs by the tenancy schema", () => {
    expect(ListOrgsDto.schema).toBe(orgListInputSchema);
    expect(UpdateOrgDto.schema).toBe(updateOrgInputSchema);
  });

  it("lists users by the users schema", () => {
    expect(ListUsersDto.schema).toBe(userListInputSchema);
  });

  it("validates through it, so a bad page is refused before any query runs", () => {
    expect(ListOrgsDto.schema.safeParse({ pageSize: 0 }).success).toBe(false);
    expect(ListUsersDto.schema.safeParse({ sort: "name:asc" }).success).toBe(
      true
    );
  });
});
