import { EventEmitter } from "node:events";

import type { ThreadRunStreamEvent } from "@aec-craft/platform-contracts";
import { Injectable } from "@nestjs/common";

/**
 * Process-local: a client gets live events only if its SSE connection lands on
 * the instance running that generation. Fine on one instance; more than one
 * needs a shared transport (LISTEN/NOTIFY or Redis).
 *
 * Missing the live events costs nothing authoritative: the stream handler reads
 * the row for a terminal run, and `complete` and `fail` persist regardless.
 */
@Injectable()
export class RunEventBus {
  // Node warns past ten listeners, and one run has a few subscribers across
  // reconnects and tabs.
  private readonly emitter = new EventEmitter().setMaxListeners(0);

  publish(runId: string, event: ThreadRunStreamEvent): void {
    this.emitter.emit(runId, event);
  }

  /** Attach immediately (so no event is missed) and iterate until `done`/close. */
  subscribe(runId: string): RunEventSubscription {
    return new RunEventSubscription(this.emitter, runId);
  }
}

/**
 * The listener attaches in the constructor rather than on first iteration, so an
 * event published before the first `next()` is buffered rather than dropped.
 */
export class RunEventSubscription
  implements AsyncIterableIterator<ThreadRunStreamEvent>
{
  private readonly queue: ThreadRunStreamEvent[] = [];
  private wake: (() => void) | null = null;
  private closed = false;
  private readonly listener: (event: ThreadRunStreamEvent) => void;

  constructor(
    private readonly emitter: EventEmitter,
    private readonly runId: string
  ) {
    this.listener = (event) => {
      this.queue.push(event);
      this.wake?.();
    };
    this.emitter.on(runId, this.listener);
  }

  [Symbol.asyncIterator](): AsyncIterableIterator<ThreadRunStreamEvent> {
    return this;
  }

  async next(): Promise<IteratorResult<ThreadRunStreamEvent>> {
    for (;;) {
      const event = this.queue.shift();
      if (event) {
        return { value: event, done: false };
      }
      if (this.closed) {
        return { value: undefined, done: true };
      }
      await new Promise<void>((resolve) => (this.wake = resolve));
      this.wake = null;
    }
  }

  async return(): Promise<IteratorResult<ThreadRunStreamEvent>> {
    this.close();
    return { value: undefined, done: true };
  }

  close(): void {
    if (this.closed) {
      return;
    }
    this.closed = true;
    this.emitter.off(this.runId, this.listener);
    this.wake?.();
  }
}
