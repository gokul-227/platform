import type { PlatformErrorSpec } from "@aec-craft/platform-contracts";

export const ThreadErrors = {
  NOT_FOUND: {
    code: "THREAD_NOT_FOUND",
    status: 404,
    name: "Thread not found",
    description:
      "No thread matches the supplied id within the requested scope.",
  },
  MESSAGE_NOT_FOUND: {
    code: "THREAD_MESSAGE_NOT_FOUND",
    status: 404,
    name: "Message not found",
    description: "No message matches the supplied id within this thread.",
  },
  RUN_NOT_FOUND: {
    code: "THREAD_RUN_NOT_FOUND",
    status: 404,
    name: "Run not found",
    description: "No run matches the supplied id within this thread.",
  },
  RUN_NOT_PENDING: {
    code: "THREAD_RUN_NOT_PENDING",
    status: 409,
    name: "Run is not pending",
    description:
      "Only a pending or streaming run can be completed, failed, or cancelled. This run is already in a terminal state.",
  },
  RUN_NOT_AWAITING_INPUT: {
    code: "THREAD_RUN_NOT_AWAITING_INPUT",
    status: 409,
    name: "Run is not awaiting input",
    description:
      "Only a run in `requires_action` can be submitted to. This run is not currently waiting on an answer.",
  },
} as const satisfies Record<string, PlatformErrorSpec>;
