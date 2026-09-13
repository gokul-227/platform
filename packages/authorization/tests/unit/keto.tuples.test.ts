import { STANDING_RELATIONS, STANDINGS } from "@aec-craft/platform-contracts";
import { describe, expect, it } from "vitest";

import {
  GROUP_NAMESPACE,
  grantTuple,
  isSubjectTuple,
  parentTuple,
  permitCheck,
  rosterJoinTuples,
  standingOfRelation,
  standingTuple,
} from "../../src/keto/keto.tuples";

describe("parentTuple", () => {
  it("points the child at the parent object itself", () => {
    expect(parentTuple("child", "parent")).toEqual({
      namespace: GROUP_NAMESPACE,
      object: "child",
      relation: "parent",
      subject_set: {
        namespace: GROUP_NAMESPACE,
        object: "parent",
        relation: "",
      },
    });
  });
});

describe("standingTuple", () => {
  it.each(STANDINGS)("stores %s as its plural relation", (standing) => {
    expect(standingTuple("group-1", standing, "subject-1")).toEqual({
      namespace: GROUP_NAMESPACE,
      object: "group-1",
      relation: STANDING_RELATIONS[standing],
      subject_id: "subject-1",
    });
  });

  it("never carries a subject set", () => {
    expect(
      standingTuple("group-1", "owner", "subject-1").subject_set
    ).toBeUndefined();
  });
});

describe("grantTuple", () => {
  it("names the granting group's relation as the subject set", () => {
    expect(grantTuple("group-1", "viewer", "group-2", "editor")).toEqual({
      namespace: GROUP_NAMESPACE,
      object: "group-1",
      relation: "viewers",
      subject_set: {
        namespace: GROUP_NAMESPACE,
        object: "group-2",
        relation: "editors",
      },
    });
  });
});

describe("rosterJoinTuples", () => {
  const tuples = rosterJoinTuples("project-group", "member-group");

  it("covers every standing of the joining group", () => {
    expect(tuples).toHaveLength(STANDINGS.length);
    expect(tuples.map((tuple) => tuple.subject_set?.relation).sort()).toEqual(
      STANDINGS.map((s) => STANDING_RELATIONS[s]).sort()
    );
  });

  it("makes each of them a viewer of the project's group", () => {
    for (const tuple of tuples) {
      expect(tuple.object).toBe("project-group");
      expect(tuple.relation).toBe("viewers");
      expect(tuple.subject_set?.object).toBe("member-group");
    }
  });
});

describe("permitCheck", () => {
  it("asks for the permit by its own name, not a standing relation", () => {
    expect(permitCheck("group-1", "write", "subject-1")).toEqual({
      namespace: GROUP_NAMESPACE,
      object: "group-1",
      relation: "write",
      subject_id: "subject-1",
    });
  });
});

describe("isSubjectTuple", () => {
  it("accepts a person's standing", () => {
    expect(isSubjectTuple(standingTuple("g", "editor", "subject-1"))).toBe(
      true
    );
  });

  it("rejects a group's grant and an empty subject", () => {
    expect(isSubjectTuple(grantTuple("g", "viewer", "g2", "owner"))).toBe(
      false
    );
    expect(isSubjectTuple(parentTuple("g", "g2"))).toBe(false);
    expect(
      isSubjectTuple({
        namespace: GROUP_NAMESPACE,
        object: "g",
        relation: "editors",
        subject_id: "",
      })
    ).toBe(false);
  });
});

describe("standingOfRelation", () => {
  it.each(STANDINGS)("round-trips %s", (standing) => {
    expect(standingOfRelation(STANDING_RELATIONS[standing])).toBe(standing);
  });

  it("returns null for a relation that is not a standing", () => {
    expect(standingOfRelation("parent")).toBeNull();
    expect(standingOfRelation("read")).toBeNull();
    // Singular: the relation vocabulary is plural, and a singular spelling is
    // a standing field that never went through the mapping.
    expect(standingOfRelation("editor")).toBeNull();
  });
});
