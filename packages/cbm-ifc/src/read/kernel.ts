import type WEBIFC from "web-ifc";

/**
 * Kernel settings for the read.
 *
 * `COORDINATE_TO_ORIGIN` is set even though nothing here reads geometry,
 * because a host that opens the same file for geometry of its own has to be
 * able to match this read's placement. Leaving it to each caller is how the
 * graph ends up describing a building the viewer draws somewhere else.
 *
 * Property and quantity values are left exactly as written, which is what the
 * unit factors are for.
 */
export const KERNEL_SETTINGS: WEBIFC.LoaderSettings = {
  COORDINATE_TO_ORIGIN: true,
};
