/**
 * `@aec-craft/platform-sdk/ui` — ready-made surfaces on `@aec-craft/ui`.
 *
 * **Settings**: a frosted, scope-aware `<Settings>` modal (account /
 * organization / project: profile, members, roles, audit, ...). Sections are
 * config-registered per scope and open over any route in any app. Consumer apps
 * register their own sections via the `app` prop and persist per-user app
 * settings with `useAppSetting`.
 *
 * **Files**: a frosted `<FileBrowser>` modal over the tree of one organization
 * or one project. Folders open a level at a time, and rename, move, delete,
 * upload and download live on the rows that hold them.
 *
 * **Uploads**: `<UploadDropzone>` for drop-or-pick uploads into an org/project
 * folder, `<UploadButton>` where a drop target does not fit, and
 * `<UploadAttachment>` for one upload row if you are building your own layout.
 * All sit on `useFileUploads`, so large files chunk, pause, resume, and survive
 * a connection drop.
 *
 * Requires the `./react` peers (`react`, `@tanstack/react-query`) plus
 * `@aec-craft/ui` and `@tanstack/react-form`; wrap the app in
 * `<PlatformProvider>` from `@aec-craft/platform-sdk/react`.
 */

export type {
  FileBrowserProps,
  FileBrowserScope,
} from "./files/ui/file-browser/file-browser";
export { FileBrowser } from "./files/ui/file-browser/file-browser";
export type { UploadAttachmentProps } from "./files/ui/upload-attachment";
export {
  formatBytes,
  UploadAttachment,
} from "./files/ui/upload-attachment";
export type { UploadButtonProps } from "./files/ui/upload-button";
export { UploadButton } from "./files/ui/upload-button";
export type { UploadDropzoneProps } from "./files/ui/upload-dropzone";
export { UploadDropzone } from "./files/ui/upload-dropzone";
export { useAppSetting } from "./surfaces/settings/hooks/use-app-setting";
export type {
  AppConfig,
  AppSectionDef,
  SectionGroupDef,
} from "./surfaces/settings/lib/types";
export { Settings } from "./surfaces/settings/settings";
