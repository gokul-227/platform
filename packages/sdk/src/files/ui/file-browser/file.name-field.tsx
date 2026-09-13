"use client";

import { Input } from "@aec-craft/ui/components/primitives/input";
import { type KeyboardEvent, useEffect, useRef, useState } from "react";

/**
 * The name cell as a field: renaming a row and naming a new folder are the same
 * gesture in the same place, so they are the same control.
 *
 * Commits once. Enter commits and the field goes away, and the blur that firing
 * causes would otherwise send the same name a second time.
 */
export function InlineNameField({
  defaultValue = "",
  placeholder,
  select = "all",
  onCancel,
  onCommit,
}: {
  defaultValue?: string;
  onCancel: () => void;
  /** Called with the trimmed name, never empty and never the unchanged one. */
  onCommit: (name: string) => void;
  placeholder?: string;
  /**
   * What is selected when the field opens. `stem` leaves the extension out of
   * the selection, so typing over the name keeps it: the server resolves a
   * file's content type from the extension when the row is created and never
   * again, so renaming `plan.ifc` to `plan.txt` leaves the stored type saying
   * otherwise. Still editable, since a wrong extension is worth fixing.
   */
  select?: "all" | "stem";
}) {
  const field = useRef<HTMLInputElement>(null);
  const [isDone, setIsDone] = useState(false);

  // The cell turned into a field on request, so the caret belongs here.
  useEffect(() => {
    const input = field.current;
    if (!input) {
      return;
    }
    const dot = input.value.lastIndexOf(".");
    if (select === "stem" && dot > 0) {
      input.setSelectionRange(0, dot);
      input.focus();
      return;
    }
    input.select();
  }, [select]);

  const commit = (value: string) => {
    if (isDone) {
      return;
    }
    setIsDone(true);
    const name = value.trim();
    if (!name || name === defaultValue) {
      onCancel();
      return;
    }
    onCommit(name);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      commit(event.currentTarget.value);
    }
    if (event.key === "Escape") {
      setIsDone(true);
      onCancel();
    }
  };

  return (
    <Input
      className="h-7 min-w-0 flex-1"
      defaultValue={defaultValue}
      onBlur={(event) => commit(event.currentTarget.value)}
      onKeyDown={onKeyDown}
      placeholder={placeholder}
      ref={field}
    />
  );
}
