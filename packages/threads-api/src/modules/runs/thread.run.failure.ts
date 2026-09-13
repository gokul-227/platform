/**
 * A raw provider error becomes a stable `reason` for logs and a `message` stored
 * on the run. The raw detail is logged server-side and never reaches a client.
 */
export type RunFailureReason =
  | "rate_limited"
  | "timeout"
  | "unavailable"
  | "step_limit"
  | "internal";

export interface RunFailure {
  message: string;
  reason: RunFailureReason;
}

const MESSAGES: Record<RunFailureReason, string> = {
  rate_limited:
    "The assistant is busy right now. Please try again in a moment.",
  timeout: "That took too long to answer. Please try again.",
  unavailable:
    "The assistant is temporarily unavailable. Please try again shortly.",
  step_limit:
    "I couldn't work that out within the step limit. Try asking something more specific.",
  internal: "Something went wrong generating a response. Please try again.",
};

export function classifyRunFailure(raw: string): RunFailure {
  const text = raw.toLowerCase();
  let reason: RunFailureReason = "internal";
  if (
    text.includes("429") ||
    text.includes("resource_exhausted") ||
    text.includes("rate limit")
  ) {
    reason = "rate_limited";
  } else if (text.includes("recursion limit")) {
    reason = "step_limit";
  } else if (text.includes("timeout") || text.includes("aborted")) {
    reason = "timeout";
  } else if (text.includes("503") || text.includes("unavailable")) {
    reason = "unavailable";
  }
  return { reason, message: MESSAGES[reason] };
}
