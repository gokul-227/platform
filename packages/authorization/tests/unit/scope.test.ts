import { PlatformError } from "@aec-craft/platform-contracts";
import { describe, expect, it } from "vitest";
import { type PermitRequest, resolveScopeRef } from "../../src/scope";

function request(overrides: Partial<PermitRequest> = {}): PermitRequest {
  return { params: {}, query: {}, ...overrides };
}

describe("resolveScopeRef", () => {
  it("reads a group id off the route", () => {
    expect(
      resolveScopeRef(request({ params: { groupId: "group-1" } }))
    ).toEqual({ type: "group", groupId: "group-1" });
  });

  it("reads one off the body and off the query", () => {
    expect(resolveScopeRef(request({ body: { groupId: "group-1" } }))).toEqual({
      type: "group",
      groupId: "group-1",
    });
    expect(resolveScopeRef(request({ query: { groupId: "group-1" } }))).toEqual(
      {
        type: "group",
        groupId: "group-1",
      }
    );
  });

  it("prefers a named group over the scope it would land in", () => {
    expect(
      resolveScopeRef(
        request({
          params: { projectId: "project-1" },
          body: { groupId: "contractor-group" },
        })
      )
    ).toEqual({ type: "group", groupId: "contractor-group" });
  });

  it("narrows a body scope to an org when it names no project", () => {
    expect(
      resolveScopeRef(request({ body: { scope: { orgId: "org-1" } } }))
    ).toEqual({ type: "org", orgId: "org-1" });
    expect(
      resolveScopeRef(
        request({ body: { scope: { orgId: "org-1", projectId: null } } })
      )
    ).toEqual({ type: "org", orgId: "org-1" });
  });

  it("narrows a body scope to the project when it names one", () => {
    expect(
      resolveScopeRef(
        request({ body: { scope: { orgId: "org-1", projectId: "project-1" } } })
      )
    ).toEqual({ type: "project", projectId: "project-1" });
  });

  it("prefers the project over the org when a route carries both", () => {
    expect(
      resolveScopeRef(
        request({ params: { orgId: "org-1", projectId: "project-1" } })
      )
    ).toEqual({ type: "project", projectId: "project-1" });
  });

  it("falls back to the org on the route", () => {
    expect(resolveScopeRef(request({ params: { orgId: "org-1" } }))).toEqual({
      type: "org",
      orgId: "org-1",
    });
    expect(resolveScopeRef(request({ query: { orgId: "org-1" } }))).toEqual({
      type: "org",
      orgId: "org-1",
    });
  });

  it("follows an explicit dotted path", () => {
    expect(
      resolveScopeRef(
        request({ body: { target: { groupId: "group-9" } } }),
        "body.target.groupId"
      )
    ).toEqual({ type: "group", groupId: "group-9" });
  });

  it("refuses an explicit path that names nothing, rather than falling back", () => {
    expect(() =>
      resolveScopeRef(
        request({ params: { orgId: "org-1" } }),
        "body.target.groupId"
      )
    ).toThrow(PlatformError);
  });

  it("refuses a request that names no group, org or project", () => {
    expect(() => resolveScopeRef(request())).toThrow(PlatformError);
    // Empty strings are not ids: a blank path segment would otherwise resolve.
    expect(() => resolveScopeRef(request({ params: { orgId: "" } }))).toThrow(
      PlatformError
    );
  });
});
