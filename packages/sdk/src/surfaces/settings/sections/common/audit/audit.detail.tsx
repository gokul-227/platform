import type { AuditEventResponse } from "@aec-craft/platform-contracts";

// Drop opaque identifiers — they're noise in a human-facing log.
// Ids and the identity subject alike: neither means anything to a person
// reading the log. `subject` is spelled in the identity layer's vocabulary
// rather than as an id, which is how it used to slip through and render raw.
const ID_KEY = /(^id$|Id$|_id$|^subject$)/;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function display(v: unknown): string {
  if (v == null || v === "") {
    return "—";
  }
  if (typeof v === "object") {
    return JSON.stringify(v);
  }
  return String(v);
}

/** Non-id, primitive entries from a bag (context or a flat payload). */
function plainFields(bag: Record<string, unknown> | null | undefined) {
  if (!bag) {
    return [];
  }
  return Object.entries(bag).filter(
    ([k, v]) => !ID_KEY.test(k) && v != null && typeof v !== "object"
  );
}

/**
 * The state that moved. Either side may be absent, which is how a create and a
 * delete are spelled: one side only, rendered as all additions or all removals
 * rather than against a column of em dashes.
 */
function DiffRows({
  before,
  after,
}: {
  before?: Record<string, unknown> | undefined;
  after?: Record<string, unknown> | undefined;
}) {
  const keys = [
    ...new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]),
  ].filter((k) => !ID_KEY.test(k));
  const changed = keys.filter(
    (k) => display(before?.[k]) !== display(after?.[k])
  );
  if (changed.length === 0) {
    return (
      <span className="text-muted-foreground text-xs">No fields changed.</span>
    );
  }
  return (
    <div className="overflow-hidden rounded-lg border border-foreground/10 font-mono text-xs">
      {changed.map((k) => (
        <div
          className="grid grid-cols-[140px_1fr] border-foreground/8 border-b last:border-b-0"
          key={k}
        >
          <div className="bg-foreground/[0.03] px-3 py-1.5 text-muted-foreground">
            {k}
          </div>
          <div className="flex flex-col px-3 py-1.5">
            {before ? (
              <span className="text-destructive">- {display(before[k])}</span>
            ) : null}
            {after ? (
              <span className="text-emerald-600 dark:text-emerald-400">
                + {display(after[k])}
              </span>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}

// The expanded row shows only what isn't already in the collapsed row: what
// moved, and the facts about the event that are not a change. The subject is in
// the collapsed row, so it is not repeated here.
//
// Every writer speaks the same payload shape (see `AuditPayload`), so this
// needs to know nothing about the resource: `before` and `after` are the state,
// either side optional, and whatever else the bag carries is a fact that sits
// beside the diff rather than instead of it.
export function AuditDetail({ event }: { event: AuditEventResponse }) {
  const { payload } = event;
  const before =
    isRecord(payload) && isRecord(payload.before) ? payload.before : undefined;
  const after =
    isRecord(payload) && isRecord(payload.after) ? payload.after : undefined;
  const hasDiff = Boolean(before || after);
  // `plainFields` drops objects, so `before` and `after` never reach it.
  const flat = isRecord(payload) ? plainFields(payload) : [];

  return (
    <div className="flex flex-col gap-2 py-1">
      {hasDiff ? <DiffRows after={after} before={before} /> : null}
      {flat.length > 0 ? (
        <div className="overflow-hidden rounded-lg border border-foreground/10 font-mono text-xs">
          {flat.map(([k, v]) => (
            <div
              className="grid grid-cols-[140px_1fr] border-foreground/8 border-b last:border-b-0"
              key={k}
            >
              <div className="bg-foreground/[0.03] px-3 py-1.5 text-muted-foreground">
                {k}
              </div>
              <div className="px-3 py-1.5">{display(v)}</div>
            </div>
          ))}
        </div>
      ) : null}
      {hasDiff || flat.length > 0 ? null : (
        <span className="text-muted-foreground text-xs">
          There's nothing more to show for this event.
        </span>
      )}
    </div>
  );
}
