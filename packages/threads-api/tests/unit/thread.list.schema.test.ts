import { threadListInputSchema } from "@aec-craft/platform-contracts";
import { describe, expect, it } from "vitest";

const ORG_ID = "5e0446eb-40f5-4d21-9bcf-27fbd7325a55";
const PROJECT_ID = "0c3f2a05-6f3b-4c9b-b8ce-2f24d6b5a111";

/**
 * Org and project scope are exclusive on the wire — a list call names exactly
 * one. The DB's partial indexes assume the same split, so this refine is the
 * contract-level guard for "org and project threads never mix".
 */
describe("threadListInputSchema (org XOR project)", () => {
  it("accepts an org-only query", () => {
    const parsed = threadListInputSchema.parse({ orgId: ORG_ID });
    expect(parsed.orgId).toBe(ORG_ID);
    expect(parsed.projectId).toBeUndefined();
  });

  it("accepts a project-only query", () => {
    const parsed = threadListInputSchema.parse({ projectId: PROJECT_ID });
    expect(parsed.projectId).toBe(PROJECT_ID);
  });

  it("rejects both scopes at once", () => {
    const result = threadListInputSchema.safeParse({
      orgId: ORG_ID,
      projectId: PROJECT_ID,
    });
    expect(result.success).toBe(false);
  });

  it("rejects a query naming neither scope", () => {
    const result = threadListInputSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});
