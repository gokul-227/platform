import { PlatformError } from "@aec-craft/platform-contracts";

import { DEFAULT_PRESET, type UploadPresetConfig } from "../config/config";
import { FileErrors } from "./file.errors";

/**
 * What a deployment accepts, and which of its presets a given upload lands
 * under. Pure over the configured list, so an admission rule can be read and
 * tested without a database, a bucket or a service.
 */

/** Exact match, or a `type/*` wildcard from the policy allowlist. */
export function matchesContentType(
  contentType: string,
  pattern: string
): boolean {
  if (pattern === "*/*" || pattern === contentType) {
    return true;
  }
  if (!pattern.endsWith("/*")) {
    return false;
  }
  return contentType.startsWith(`${pattern.slice(0, -1)}`);
}

/**
 * Routing is the deployment's job, not the uploader's: a client should not have
 * to know that this platform indexes PDFs for its PDFs to be indexed. Matched
 * against the same allowlists admission uses, so what a deployment accepts and
 * what it does with it cannot describe different sets.
 *
 * First match wins, and `default` is the fallback rather than a candidate.
 */
export function selectPreset(
  presets: readonly UploadPresetConfig[],
  contentType: string
): string {
  for (const preset of presets) {
    if (
      preset.name === DEFAULT_PRESET ||
      preset.acceptedContentTypes === null
    ) {
      continue;
    }
    const matches = preset.acceptedContentTypes.some((pattern) =>
      matchesContentType(contentType, pattern)
    );
    if (matches) {
      return preset.name;
    }
  }
  return DEFAULT_PRESET;
}

/**
 * An unknown name fails closed rather than falling back: the caller asked to be
 * held to a stricter limit, and the deployment-wide one grants more. Omitting
 * the name is different, and resolves to `default`.
 */
export function presetByName(
  presets: readonly UploadPresetConfig[],
  name: string | undefined
): UploadPresetConfig {
  const wanted = name ?? DEFAULT_PRESET;
  const found = presets.find((preset) => preset.name === wanted);
  if (!found) {
    throw new PlatformError(FileErrors.PRESET_NOT_FOUND);
  }
  return found;
}

/** The named preset's limits, checked before a row or a session is created. */
export function assertPresetAccepts(
  presets: readonly UploadPresetConfig[],
  contentType: string,
  size: number,
  name: string | undefined
): void {
  const preset = presetByName(presets, name);
  if (size > preset.maxFileSizeBytes) {
    throw new PlatformError(FileErrors.TOO_LARGE);
  }
  if (preset.acceptedContentTypes === null) {
    return;
  }
  const accepted = preset.acceptedContentTypes.some((pattern) =>
    matchesContentType(contentType, pattern)
  );
  if (!accepted) {
    throw new PlatformError(FileErrors.CONTENT_TYPE_NOT_ALLOWED);
  }
}
