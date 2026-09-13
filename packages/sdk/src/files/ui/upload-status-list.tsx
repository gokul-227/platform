"use client";

import { AttachmentGroup } from "@aec-craft/ui/components/primitives/attachment";
import { Button } from "@aec-craft/ui/components/primitives/button";

import type { FileUploadsResult } from "../react/file.hooks";

import { UploadAttachment } from "./upload-attachment";

/**
 * The rows under an upload surface: one `<UploadAttachment>` per file, plus a
 * way to clear the batch once nothing is moving. Shared by the dropzone and the
 * button so both read the same.
 *
 * `layout` picks the arrangement the primitive was built for: a stacked list
 * under a drop target, or `AttachmentGroup`'s horizontal snap strip where the
 * surface is a single button in a toolbar.
 */
export function UploadStatusList({
  uploads,
  layout = "list",
}: {
  layout?: "list" | "strip";
  uploads: FileUploadsResult;
}): React.ReactElement | null {
  if (uploads.items.length === 0) {
    return null;
  }

  return (
    <>
      {layout === "strip" ? (
        // Clear sits in the same row as the strip: below it, right-aligned under
        // a horizontally scrolling group, it reads as belonging to nothing.
        <div className="flex min-w-0 items-center gap-2">
          <AttachmentGroup className="min-w-0 flex-1">
            {uploads.items.map((item) => (
              <UploadAttachment
                className="w-72"
                key={item.id}
                onAbort={item.abort}
                onDismiss={item.dismiss}
                onRetry={item.retry}
                state={item.state}
              />
            ))}
          </AttachmentGroup>
          {uploads.isUploading ? null : (
            <Button
              className="shrink-0 text-muted-foreground"
              onClick={() => uploads.clear()}
              size="sm"
              variant="ghost"
            >
              Clear
            </Button>
          )}
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-2">
            {uploads.items.map((item) => (
              <UploadAttachment
                key={item.id}
                onAbort={item.abort}
                onDismiss={item.dismiss}
                onRetry={item.retry}
                state={item.state}
              />
            ))}
          </div>
          {uploads.isUploading ? null : (
            <div className="flex justify-end">
              <Button
                className="text-muted-foreground"
                onClick={() => uploads.clear()}
                size="sm"
                variant="ghost"
              >
                Clear
              </Button>
            </div>
          )}
        </>
      )}
    </>
  );
}
