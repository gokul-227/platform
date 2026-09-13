import { describe, expect, it } from "vitest";

import {
  type GrantCeiling,
  type GroupStanding,
  grantCeiling,
  mayGrant,
  PERMIT_FLOOR,
  PERMITS,
  STANDING_LABELS,
  STANDING_RELATIONS,
  STANDINGS,
  standingRank,
} from "../../src/tenancy/groups/standing";

describe("the ladder", () => {
  it("runs highest first, and rank is position on it", () => {
    expect(STANDINGS).toEqual([
      "owner",
      "admin",
      "manager",
      "editor",
      "viewer",
    ]);
    expect(standingRank("owner")).toBe(0);
    expect(standingRank("viewer")).toBe(STANDINGS.length - 1);
    const ranks = STANDINGS.map(standingRank);
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
  });

  it("names every standing exactly once, in Keto and on screen", () => {
    const relations = STANDINGS.map((s) => STANDING_RELATIONS[s]);
    expect(new Set(relations).size).toBe(STANDINGS.length);
    for (const standing of STANDINGS) {
      expect(STANDING_RELATIONS[standing]).toBe(`${standing}s`);
      expect(STANDING_LABELS[standing]).toBeTruthy();
    }
  });

  it("gives every permit a floor on the ladder", () => {
    for (const permit of PERMITS) {
      expect(STANDINGS).toContain(PERMIT_FLOOR[permit]);
    }
    // The floors climb with the permits, which is what makes falling through
    // work: read is satisfied by the lowest standing, own only by the highest.
    expect(PERMITS.map((p) => standingRank(PERMIT_FLOOR[p]))).toEqual([
      4, 3, 2, 1, 0,
    ]);
  });

  it("freezes the maps, so nothing edits the vocabulary at runtime", () => {
    expect(Object.isFrozen(STANDING_RELATIONS)).toBe(true);
    expect(Object.isFrozen(PERMIT_FLOOR)).toBe(true);
    expect(Object.isFrozen(STANDING_LABELS)).toBe(true);
  });
});

describe("grantCeiling", () => {
  it("reads the highest permit held, and nothing below manage grants at all", () => {
    expect(grantCeiling({ own: true, admin: true, manage: true })).toBe("any");
    expect(grantCeiling({ own: false, admin: true, manage: true })).toBe(
      "belowOwner"
    );
    expect(grantCeiling({ own: false, admin: false, manage: true })).toBe(
      "belowManager"
    );
    expect(
      grantCeiling({ own: false, admin: false, manage: false })
    ).toBeNull();
  });

  it("takes the permit at face value, not the ladder's implication", () => {
    // `own` without the two below it is not a shape the OPL produces, and the
    // answer still follows the permit rather than second-guessing it.
    expect(grantCeiling({ own: true, admin: false, manage: false })).toBe(
      "any"
    );
  });
});

describe("mayGrant", () => {
  const table: [GrantCeiling, GroupStanding, boolean][] = [
    ["any", "owner", true],
    ["any", "viewer", true],
    ["belowOwner", "owner", false],
    ["belowOwner", "admin", true],
    ["belowOwner", "viewer", true],
    ["belowManager", "owner", false],
    ["belowManager", "admin", false],
    ["belowManager", "manager", false],
    ["belowManager", "editor", true],
    ["belowManager", "viewer", true],
  ];

  it.each(table)("%s may grant %s: %s", (ceiling, target, allowed) => {
    expect(mayGrant(ceiling, target)).toBe(allowed);
  });

  it("lets an owner appoint a peer, and an admin appoint another admin", () => {
    // Both are deliberate: an org created with one owner could otherwise never
    // gain a second, and the tier admin exists for is an absent owner.
    expect(mayGrant("any", "owner")).toBe(true);
    expect(mayGrant("belowOwner", "admin")).toBe(true);
  });

  it("stops a manager from deepening the administration chain", () => {
    expect(mayGrant("belowManager", "manager")).toBe(false);
  });
});
