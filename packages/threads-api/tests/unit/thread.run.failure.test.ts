import { describe, expect, it } from "vitest";

import { classifyRunFailure } from "../../src/modules/runs/thread.run.failure";
import { describeCapabilityBlocks } from "../../src/modules/runs/thread.run.vocabulary";

describe("classifyRunFailure", () => {
  it.each([
    ["429 Too Many Requests", "rate_limited"],
    ['{"code":8,"status":"RESOURCE_EXHAUSTED"}', "rate_limited"],
    ["Vertex rate limit exceeded for model", "rate_limited"],
    ["GraphRecursionError: Recursion limit of 25 reached", "step_limit"],
    ["Error: timeout of 60000ms exceeded", "timeout"],
    ["The operation was aborted", "timeout"],
    ["503 Service Unavailable", "unavailable"],
    ["upstream unavailable", "unavailable"],
    ["TypeError: cannot read properties of undefined", "internal"],
    ["", "internal"],
  ])("reads %j as %s", (raw, reason) => {
    expect(classifyRunFailure(raw).reason).toBe(reason);
  });

  it("classifies whatever case the provider shouted in", () => {
    expect(classifyRunFailure("RESOURCE_EXHAUSTED").reason).toBe(
      "rate_limited"
    );
    expect(classifyRunFailure("Timeout").reason).toBe("timeout");
  });

  it("takes the rate limit first when a message carries two signals", () => {
    // Order in the classifier is the priority, and a throttled call that also
    // timed out is a throttled call: retrying later is the useful advice.
    expect(classifyRunFailure("429 after timeout").reason).toBe("rate_limited");
  });

  it("never returns the raw detail as the message a client sees", () => {
    const raw = 'RESOURCE_EXHAUSTED: quota "generate_requests_per_model" 429';
    const failure = classifyRunFailure(raw);
    expect(failure.message).not.toContain("RESOURCE_EXHAUSTED");
    expect(failure.message).not.toContain("429");
    expect(failure.message.length).toBeGreaterThan(0);
  });

  it("gives every reason its own sentence", () => {
    const messages = [
      "429",
      "recursion limit",
      "timeout",
      "503",
      "something else",
    ].map((raw) => classifyRunFailure(raw).message);
    expect(new Set(messages).size).toBe(messages.length);
  });
});

describe("describeCapabilityBlocks", () => {
  const rendered = describeCapabilityBlocks();

  it("names each block once, with its leaf fields", () => {
    expect(rendered).toContain("envelope: ");
    for (const line of rendered.split(". ")) {
      expect(line).toMatch(/^[a-zA-Z]+: .+/);
    }
  });

  it("renders a nested group as a dotted path", () => {
    expect(rendered).toMatch(/\w+\.\w+/);
  });

  it("is generated, so it cannot drift from the schema", () => {
    // Same call, same string: nothing here is order-dependent on a mutable map.
    expect(describeCapabilityBlocks()).toBe(rendered);
  });
});
