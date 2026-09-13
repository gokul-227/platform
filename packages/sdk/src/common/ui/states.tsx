"use client";

// Section state helpers. Loading and toast are re-exported from @aec-craft/ui so
// settings sections share one local import path; the error state is here
// because mapping a PlatformError onto it is the platform's knowledge, not the
// design system's.

import { PlatformError } from "@aec-craft/platform-contracts";
import { EmptyState } from "@aec-craft/ui/components/blocks/empty-state";
import { Button } from "@aec-craft/ui/components/primitives/button";
import {
  ArrowClockwiseIcon,
  CloudWarningIcon,
  WarningCircleIcon,
} from "@aec-craft/ui/icons";

export { SectionLoading } from "@aec-craft/ui/components/blocks/section";
export { toastError } from "@aec-craft/ui/lib/toast";

/**
 * A failed read, told apart by whether anything the caller does will help.
 *
 * A dependency being down and the request being wrong are the same red box to
 * whoever built it and nothing alike to whoever is looking at it: one is worth
 * waiting out, the other is not. `503` and the `*_UNAVAILABLE` codes are the
 * platform's way of saying "later", so that is the line, and only that side
 * gets told to retry.
 *
 * The error's own `description` is written for the person who hit it, so it is
 * shown rather than replaced. `subject` names what failed to load, for the
 * fallback when there is no PlatformError to read: a network fault, or a
 * gateway answering before the API did.
 */
export function SectionError({
  error,
  onRetry,
  subject,
}: {
  error: unknown;
  onRetry?: () => void;
  /** What could not be loaded, lowercase: "the member list", "the audit log". */
  subject: string;
}) {
  const platform = error instanceof PlatformError ? error : null;
  const isUnavailable =
    platform?.statusCode === 503 || !!platform?.code.endsWith("_UNAVAILABLE");

  return (
    <EmptyState
      action={
        onRetry ? (
          <Button onClick={onRetry} size="sm" variant="outline">
            <ArrowClockwiseIcon />
            Try again
          </Button>
        ) : null
      }
      description={
        platform?.description ??
        "Check your connection and try again. If it keeps happening, the service may be down."
      }
      icon={isUnavailable ? CloudWarningIcon : WarningCircleIcon}
      title={
        isUnavailable
          ? "This isn't available right now."
          : `We couldn't load ${subject}.`
      }
    />
  );
}
