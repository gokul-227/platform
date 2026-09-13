import type { ThreadRunStreamEvent } from "@aec-craft/platform-contracts";
import { RunEventBus } from "@aec-craft/platform-threads-api/nest";
import { describe, expect, it } from "vitest";

/**
 * The in-process SSE fan-out. The subscription contract is what the stream
 * endpoint's race-safety rests on: listeners attach eagerly (in `subscribe`,
 * not on first read), so events published between subscribe and the status
 * re-read are buffered — never dropped.
 */
describe("RunEventBus", () => {
  const token = (delta: string): ThreadRunStreamEvent => ({
    type: "token",
    delta,
  });
  const done: ThreadRunStreamEvent = { type: "done", status: "complete" };

  it("buffers events published between subscribe and the first read", async () => {
    const bus = new RunEventBus();
    const sub = bus.subscribe("run-1");
    bus.publish("run-1", token("Hal"));
    bus.publish("run-1", token("lo"));
    bus.publish("run-1", done);

    const seen: ThreadRunStreamEvent[] = [];
    for await (const event of sub) {
      seen.push(event);
      if (event.type === "done") {
        break;
      }
    }
    expect(seen).toEqual([token("Hal"), token("lo"), done]);
  });

  it("drops events published before subscribe (process-local, no history)", async () => {
    const bus = new RunEventBus();
    bus.publish("run-1", token("verpasst"));

    const sub = bus.subscribe("run-1");
    bus.publish("run-1", done);

    const first = await sub.next();
    expect(first.value).toEqual(done);
    sub.close();
  });

  it("fans out to every subscriber of the same run, isolated per run id", async () => {
    const bus = new RunEventBus();
    const a = bus.subscribe("run-a");
    const b = bus.subscribe("run-a");
    const other = bus.subscribe("run-b");

    bus.publish("run-a", done);
    bus.publish("run-b", token("nur b"));

    expect((await a.next()).value).toEqual(done);
    expect((await b.next()).value).toEqual(done);
    expect((await other.next()).value).toEqual(token("nur b"));
    a.close();
    b.close();
    other.close();
  });

  it("close() detaches and ends a pending read", async () => {
    const bus = new RunEventBus();
    const sub = bus.subscribe("run-1");

    const pending = sub.next();
    sub.close();
    expect((await pending).done).toBe(true);

    // A post-close publish must not resurrect the iterator.
    bus.publish("run-1", token("zu spät"));
    expect((await sub.next()).done).toBe(true);
  });
});
