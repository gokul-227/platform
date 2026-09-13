"use client";

import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@aec-craft/ui/components/primitives/input-group";
import { MagnifyingGlassIcon, XIcon } from "@aec-craft/ui/icons";
import { useEffect, useState } from "react";

import { useFileBrowser } from "./provider";

/** Below this a needle matches most of a library, and each keystroke is a request. */
export const MIN_CHARS = 2;

/** How long typing settles before it becomes a query. */
const DEBOUNCE_MS = 250;

/**
 * The needle, typed here and committed to the browser after it settles. Local
 * state is what the field shows; the committed value is what the tree reads, so
 * a keystroke does not send a request and the field never lags behind a finger.
 */
export function FileSearchField() {
  const { search, setSearch } = useFileBrowser();
  const [raw, setRaw] = useState(search);

  // Reveal and a scope change both clear the search, and the field has to follow
  // it back to empty.
  useEffect(() => {
    if (search === "") {
      setRaw("");
    }
  }, [search]);

  useEffect(() => {
    const needle = raw.trim();
    const next = needle.length >= MIN_CHARS ? needle : "";
    if (next === search) {
      return;
    }
    const id = setTimeout(() => setSearch(next), DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [raw, search, setSearch]);

  return (
    <InputGroup className="h-8 w-full border-foreground/20 sm:max-w-72">
      <InputGroupAddon>
        <MagnifyingGlassIcon className="size-3.5" />
      </InputGroupAddon>
      <InputGroupInput
        className="text-sm"
        onChange={(event) => setRaw(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            setRaw("");
          }
        }}
        placeholder="Search this scope…"
        value={raw}
      />
      {raw === "" ? null : (
        <InputGroupAddon align="inline-end">
          <button
            aria-label="Clear search"
            className="text-muted-foreground transition-colors hover:text-foreground"
            onClick={() => setRaw("")}
            type="button"
          >
            <XIcon className="size-3.5" />
          </button>
        </InputGroupAddon>
      )}
    </InputGroup>
  );
}

/**
 * The matched run inside a name, marked rather than coloured: a result list
 * where every hit is highlighted needs the mark to be quiet.
 *
 * Case-insensitive, and only the first run per name, which is the one the reader
 * typed towards.
 */
export function Highlight({
  needle,
  text,
}: {
  needle: string;
  text: string;
}): React.ReactNode {
  const at = text.toLowerCase().indexOf(needle.toLowerCase());
  if (needle === "" || at === -1) {
    return text;
  }
  return (
    <>
      {text.slice(0, at)}
      <mark className="rounded-sm bg-foreground/12 text-foreground">
        {text.slice(at, at + needle.length)}
      </mark>
      {text.slice(at + needle.length)}
    </>
  );
}
