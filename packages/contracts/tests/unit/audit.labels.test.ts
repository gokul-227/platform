import { describe, expect, it } from "vitest";

import {
  AUDIT_ACTION_LABELS,
  auditActionLabel,
} from "../../src/audit/audit.labels";
import { AUDIT_ACTIONS } from "../../src/audit/audit.vocabulary";

describe("auditActionLabel", () => {
  it("renders a known action as its label", () => {
    expect(auditActionLabel({ resource: "org", verb: "created" })).toBe(
      "Organization created"
    );
  });

  it("falls back to the pair for an action that ships before its label", () => {
    expect(auditActionLabel({ resource: "invoice", verb: "issued" })).toBe(
      "invoice issued"
    );
  });
});

describe("the label map", () => {
  it("covers every action in the vocabulary", () => {
    const missing: string[] = [];
    for (const [resource, verbs] of Object.entries(AUDIT_ACTIONS)) {
      for (const verb of verbs) {
        if (!AUDIT_ACTION_LABELS[`${resource}.${verb}`]) {
          missing.push(`${resource}.${verb}`);
        }
      }
    }
    expect(missing).toEqual([]);
  });

  it("labels nothing the vocabulary does not declare", () => {
    const declared = new Set(
      Object.entries(AUDIT_ACTIONS).flatMap(([resource, verbs]) =>
        verbs.map((verb) => `${resource}.${verb}`)
      )
    );
    expect(
      Object.keys(AUDIT_ACTION_LABELS).filter((key) => !declared.has(key))
    ).toEqual([]);
  });
});
