"use client";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@aec-craft/ui/components/primitives/tooltip";
import { cn } from "@aec-craft/ui/lib/utils";

import type { FileResponse } from "../../../index";

/** Keyed by the wire value. An unmapped status renders grey, named after
 *  itself, so a new enum member degrades rather than disappears. */
const STATUS: Record<string, { className: string; description: string }> = {
  pending: {
    className: "bg-amber-500",
    description: "Uploading. The bytes have not all arrived yet.",
  },
  ready: {
    className: "bg-emerald-500",
    description: "Ready. The file is complete and can be downloaded.",
  },
};

const UNKNOWN = {
  className: "bg-foreground/25",
  description: "Unknown status.",
};

/** A folder has no status: it is complete the moment it exists. */
export function FileStatusDot({ file }: { file: FileResponse }) {
  if (file.type === "folder") {
    return null;
  }
  const known = STATUS[file.status];
  const { className, description } = known ?? {
    ...UNKNOWN,
    description: `${file.status}. ${UNKNOWN.description}`,
  };

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span
            aria-label={`Status: ${file.status}`}
            className="inline-flex size-4 items-center justify-center"
            role="img"
          />
        }
      >
        <span className={cn("size-2 rounded-full", className)} />
      </TooltipTrigger>
      <TooltipContent>{description}</TooltipContent>
    </Tooltip>
  );
}
