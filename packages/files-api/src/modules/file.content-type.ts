/**
 * Browsers leave `File.type` empty for every extension they do not know, which
 * is every AEC exchange format, so an IFC model arrives as a generic blob.
 *
 * On the server rather than in each client, because a preset validates the
 * declared type against its allowlist and the guess has to come from the same
 * place as the check. Partial on purpose: anything unlisted stays generic.
 */

const MIME_BY_EXTENSION: Record<string, string> = {
  // AEC exchange + model formats
  bcf: "application/zip",
  bcfzip: "application/zip",
  dgn: "application/octet-stream",
  dwg: "image/vnd.dwg",
  dxf: "image/vnd.dxf",
  ifc: "application/x-step",
  ifcxml: "application/xml",
  ifczip: "application/zip",
  iges: "model/iges",
  igs: "model/iges",
  nwc: "application/octet-stream",
  nwd: "application/octet-stream",
  rfa: "application/octet-stream",
  rvt: "application/octet-stream",
  skp: "application/octet-stream",
  step: "application/x-step",
  stp: "application/x-step",
  // Geometry / viewer payloads
  e57: "application/octet-stream",
  fbx: "application/octet-stream",
  glb: "model/gltf-binary",
  gltf: "model/gltf+json",
  las: "application/vnd.las",
  laz: "application/vnd.laszip",
  obj: "model/obj",
  stl: "model/stl",
  // Documents and data browsers sometimes miss
  csv: "text/csv",
  geojson: "application/geo+json",
  json: "application/json",
  md: "text/markdown",
  yaml: "application/yaml",
  yml: "application/yaml",
};

const GENERIC = "application/octet-stream";

/**
 * The declared type, unless it is the generic one and the extension says
 * something more specific. A client that knows better always wins.
 */
export function resolveContentType(declared: string, fileName: string): string {
  if (declared !== GENERIC && declared !== "") {
    return declared;
  }
  const dot = fileName.lastIndexOf(".");
  if (dot < 0 || dot === fileName.length - 1) {
    return GENERIC;
  }
  return MIME_BY_EXTENSION[fileName.slice(dot + 1).toLowerCase()] ?? GENERIC;
}
