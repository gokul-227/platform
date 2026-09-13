// `@aec-craft/platform-admin-sdk` — typed client for the platform's staff
// surface (`/admin/*`).
//
// A separate package from `@aec-craft/platform-sdk` on purpose: that one ships
// to product teams, and the routes and shapes of an internal console are not
// theirs to read. It depends on the platform SDK for the transport, so nothing
// about auth, retries or error mapping is duplicated here.
//
// Every route needs a browser session the identity provider has marked as staff.
// Consent puts no console role into an OAuth grant, so a client-credentials or
// delegated token cannot reach any of this, whatever scopes it holds.

import { Http, type PlatformClientOptions } from "@aec-craft/platform-sdk";

import { AdminMemberClient } from "./members/member.client";
import { AdminOrgClient } from "./orgs/org.client";
import { AdminProjectClient } from "./projects/project.client";
import { AdminUserClient } from "./users/user.client";

export { AdminMemberClient } from "./members/member.client";
export { AdminOrgClient } from "./orgs/org.client";
export { AdminProjectClient } from "./projects/project.client";
export { AdminUserClient } from "./users/user.client";

/**
 * The staff client. Same construction as `PlatformClient`, so a console holding
 * both passes the same options to each.
 *
 *   const admin = new AdminClient({
 *     baseUrl: "https://api.example.com",
 *     getAuthHeaders: async () => ({ Authorization: `Bearer ${await token()}` }),
 *   });
 *   const everyTenant = await admin.orgs.list();
 */
export class AdminClient {
  readonly members: AdminMemberClient;
  readonly orgs: AdminOrgClient;
  readonly projects: AdminProjectClient;
  readonly users: AdminUserClient;

  constructor(options: PlatformClientOptions) {
    const http = new Http(options);
    this.members = new AdminMemberClient(http);
    this.orgs = new AdminOrgClient(http);
    this.projects = new AdminProjectClient(http);
    this.users = new AdminUserClient(http);
  }
}
