import WEBIFC from "web-ifc";

import { buildIfcModel, type IfcModelReport } from "../model";
import { scanOpenings } from "../openings/scan";
import { scanSpaceBoundaries } from "../space-boundaries/scan";
import type { IfcModel } from "../types";
import { detectUnits } from "../units";
import { IfcEntityReader } from "./entities";
import { KERNEL_SETTINGS } from "./kernel";

/** What one file yields. */
export interface IfcReadResult {
  model: IfcModel;
  report: IfcModelReport;
  /**
   * Spaces the file declared open to another space, with no element between
   * them. There is nothing for an edge to point at, so the fact travels as data
   * for a consumer that can pair them.
   */
  virtualBoundarySpaces: Set<string>;
}

export interface IfcReadOptions {
  bytes: Uint8Array;
}

function decode(bytes: Uint8Array, limit?: number): string {
  return new TextDecoder("utf-8", { fatal: false }).decode(
    limit === undefined ? bytes : bytes.subarray(0, limit)
  );
}

/**
 * Read one file, run `use` against it, then free the kernel.
 *
 * Scoped rather than returning something open so the WASM heap is always
 * released; a worker that forgets loses a few hundred megabytes per import.
 *
 * Semantics only. The kernel is opened for entities, property sets and
 * relationships, and no mesh is ever streamed, which is most of what a read
 * would otherwise cost in time and memory.
 */
export async function withIfcRead<T>(
  options: IfcReadOptions,
  use: (read: IfcReadResult) => Promise<T>
): Promise<T> {
  const api = new WEBIFC.IfcAPI();
  await api.Init();
  const modelId = api.OpenModel(options.bytes, KERNEL_SETTINGS);

  try {
    const { containments, elements } = new IfcEntityReader(api, modelId).read();

    // Read from the characters, not the kernel. It leaves property values as
    // written, and it does not expose whether a boundary was virtual.
    const text = decode(options.bytes);
    const unitFactors = detectUnits(text);
    const boundaries = scanSpaceBoundaries(text);
    const { hostings, openPassages } = scanOpenings(text);

    const built = buildIfcModel({
      boundaries,
      hostings,
      openPassages,
      source: { containments, elements },
      ...(unitFactors ? { unitFactors } : {}),
    });

    return await use({
      model: built.model,
      report: built.report,
      virtualBoundarySpaces: built.virtualBoundarySpaces,
    });
  } finally {
    // A malformed file traps the kernel, and closing a trapped model traps
    // again. Letting that through would replace the real reason with a
    // teardown error.
    try {
      api.CloseModel(modelId);
    } catch {
      // Per-call instance; its heap goes with it.
    }
  }
}
