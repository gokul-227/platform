import { describe, expect, it } from "vitest";

import {
  assertCypherScoped,
  scopedNodes,
  scopedPath,
} from "../../src/modules/query/scope.cypher";

/**
 * The guard on hand-written Cypher.
 *
 * What it defends against is an author forgetting a clause, not an attacker
 * injecting one: every statement it sees is a constant in this repo and caller
 * input arrives as bound parameters. The last block records what it therefore
 * does *not* catch, so nobody reads a passing check as more than it is.
 */
describe("a statement must scope every node it binds", () => {
  it("refuses one with no scope at all", () => {
    expect(() => assertCypherScoped("MATCH (n:Node) RETURN n.id")).toThrow(
      /Unscoped node alias n/
    );
  });

  it("refuses one that names the partition but not the groups", () => {
    expect(() =>
      assertCypherScoped(
        "MATCH (n:Node) WHERE n.projectId = $projectId RETURN n.id"
      )
    ).toThrow(/Unscoped node alias n/);
  });

  it("refuses one that names the groups but not the partition", () => {
    expect(() =>
      assertCypherScoped(
        "MATCH (n:Node) WHERE n.groupId IN $groups RETURN n.id"
      )
    ).toThrow(/Unscoped node alias n/);
  });

  it("refuses a second alias left open", () => {
    expect(() =>
      assertCypherScoped(
        `MATCH (a:Node)-[:X]-(b:Node) WHERE ${scopedNodes("a")} RETURN b.id`
      )
    ).toThrow(/Unscoped node alias b/);
  });

  it("refuses a third, which is the one a two-alias habit misses", () => {
    expect(() =>
      assertCypherScoped(
        `MATCH (a:Node)-[:X]-(b:Node)-[:Y]-(c:Node)
         WHERE ${scopedNodes("a", "b")} RETURN c.id`
      )
    ).toThrow(/Unscoped node alias c/);
  });

  it("refuses an alias bound in a later MATCH", () => {
    expect(() =>
      assertCypherScoped(
        `MATCH (a:Node) WHERE ${scopedNodes("a")}
         MATCH (leak:Node) WHERE leak.class = 'space'
         RETURN leak.id`
      )
    ).toThrow(/Unscoped node alias leak/);
  });

  it("refuses an alias bound in an OPTIONAL MATCH", () => {
    expect(() =>
      assertCypherScoped(
        `MATCH (a:Node) WHERE ${scopedNodes("a")}
         OPTIONAL MATCH (a)-[:X]-(other:Node)
         RETURN other.id`
      )
    ).toThrow(/Unscoped node alias other/);
  });

  it("refuses a statement binding no node, which cannot have been scoped", () => {
    expect(() => assertCypherScoped("RETURN 1")).toThrow(/at least one/);
  });

  it("names every unscoped alias, not just the first", () => {
    expect(() =>
      assertCypherScoped("MATCH (a:Node)-[:X]-(b:Node) RETURN a.id, b.id")
    ).toThrow(/aliases a, b/);
  });

  it("accepts a statement that scopes all of them", () => {
    expect(() =>
      assertCypherScoped(
        `MATCH (a:Node)-[:X]-(b:Node)-[:Y]-(c:Node)
         WHERE ${scopedNodes("a", "b", "c")} RETURN c.id`
      )
    ).not.toThrow();
  });
});

describe("a scope clause has to be executable, not merely present", () => {
  it("is not satisfied by a line comment", () => {
    expect(() =>
      assertCypherScoped(
        `MATCH (n:Node)
         // n.projectId = $projectId AND n.groupId IN $groups
         RETURN n.id`
      )
    ).toThrow(/Unscoped node alias n/);
  });

  it("is not satisfied by a block comment", () => {
    expect(() =>
      assertCypherScoped(`MATCH (n:Node) /* ${scopedNodes("n")} */ RETURN n.id`)
    ).toThrow(/Unscoped node alias n/);
  });

  it("is not satisfied by a string literal", () => {
    expect(() =>
      assertCypherScoped(
        `MATCH (n:Node) RETURN "n.projectId = $projectId AND n.groupId IN $groups" AS pretend`
      )
    ).toThrow(/Unscoped node alias n/);
  });

  it("does not lose a real clause to a nearby comment", () => {
    expect(() =>
      assertCypherScoped(
        `MATCH (n:Node)
         // spaces only
         WHERE ${scopedNodes("n")} AND n.class = 'space'
         RETURN n.id`
      )
    ).not.toThrow();
  });
});

describe("what the guard does not catch, recorded on purpose", () => {
  it("passes a clause defeated by an OR, because it does not read structure", () => {
    // Text inspection cannot see that this predicate is disjoined away. The
    // statement is still a constant in this repo, so what stops it is review,
    // and what this test stops is somebody believing otherwise.
    expect(() =>
      assertCypherScoped(
        `MATCH (n:Node) WHERE (${scopedNodes("n")}) OR true RETURN n.id`
      )
    ).not.toThrow();
  });

  it("passes a variable-length path whose intermediates are unscoped", () => {
    // `m` is scoped and the hops between are not: they have no alias to carry a
    // predicate. `scopedPath` is the only thing that reaches them.
    const unguarded = `MATCH p=(n:Node)-[:X*1..5]-(m:Node)
      WHERE ${scopedNodes("n", "m")} RETURN m.id`;
    expect(() => assertCypherScoped(unguarded)).not.toThrow();

    const guarded = `${unguarded} AND ${scopedPath("p")}`;
    expect(guarded).toContain("all(x IN nodes(p)");
  });
});
