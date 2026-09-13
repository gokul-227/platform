import {
  CubeIcon,
  FileCodeIcon,
  FileCsvIcon,
  FileIcon,
  FileImageIcon,
  FilePdfIcon,
  FileTextIcon,
  FileZipIcon,
} from "@aec-craft/ui/icons";
import type { IconComponent } from "@aec-craft/ui/lib/icon";

import type { FileResponse } from "../../../index";

/**
 * What a row is, at a glance, without spending a column on it. The type is
 * already legible in the name's extension; the icon is what makes a long list
 * scannable, so it says the family rather than the format.
 *
 * The declared type decides it where it is specific. Half the formats this
 * platform exists for are `application/octet-stream` (rvt, nwd, skp, fbx), which
 * says nothing, so those come off the extension instead. Presentation only: the
 * type a preset is checked against is still the declared one.
 */
const MODEL_EXTENSIONS = new Set([
  "3dm",
  "dae",
  "dgn",
  "e57",
  "fbx",
  "ifc",
  "iges",
  "igs",
  "nwc",
  "nwd",
  "obj",
  "rfa",
  "rvt",
  "skp",
  "step",
  "stl",
  "stp",
]);

const ARCHIVE_EXTENSIONS = new Set([
  "7z",
  "bcf",
  "bcfzip",
  "gz",
  "ifczip",
  "rar",
  "tar",
  "zip",
]);

export function iconFor(file: FileResponse): IconComponent {
  const contentType = file.content?.contentType ?? "";
  const extension = extensionOf(file.name);

  if (contentType.startsWith("image/")) {
    return FileImageIcon;
  }
  if (contentType === "application/pdf") {
    return FilePdfIcon;
  }
  if (contentType.startsWith("model/") || MODEL_EXTENSIONS.has(extension)) {
    return CubeIcon;
  }
  if (contentType === "application/zip" || ARCHIVE_EXTENSIONS.has(extension)) {
    return FileZipIcon;
  }
  if (contentType === "text/csv" || extension === "csv") {
    return FileCsvIcon;
  }
  if (
    contentType === "application/json" ||
    contentType.endsWith("/xml") ||
    contentType === "text/xml"
  ) {
    return FileCodeIcon;
  }
  if (contentType.startsWith("text/")) {
    return FileTextIcon;
  }
  return FileIcon;
}

function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
}
