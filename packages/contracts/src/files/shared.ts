import { type Scope, scopeSchema } from "../common/scope";
/**
 * Shared primitives for the files domain. Mirrors the graph module's scoping:
 * a file lives in an org's shared library (`projectId IS NULL`, visible
 * read-only from every project in the org) or private to a project. The scope
 * is the collection's URL (`/orgs/:orgId/files`, `/projects/:projectId/files`)
 * and is resolved from the row's own columns for by-id ops.
 */

import { z } from "zod";

// ── Scope ──────────────────────────────────────────────────────────────────
// Addressing shape for the SDK: which nested collection a call goes to. Not a
// wire field — the server reads the scope off the path.
export const fileScopeSchema = scopeSchema;
export type FileScope = Scope;

// ── Scope filter (project lists only) ───────────────────────────────────────
export const fileScopeFilterSchema = z
  .enum(["project", "org"])
  .describe(
    "Narrow a project file list. `project` returns project-only files; " +
      "`org` returns only the inherited org-library files. Default is the full hydrated set. Not accepted on an org list."
  );

// ── Discriminators ──────────────────────────────────────────────────────────
export const fileTypeSchema = z
  .enum(["file", "folder"])
  .describe(
    "`file` is an uploaded blob; `folder` is a tree node with no content."
  );
export type FileType = z.infer<typeof fileTypeSchema>;

export const fileStatusSchema = z
  .enum(["pending", "processing", "ready"])
  .describe(
    "`pending` = a file row exists and an upload URL was issued, but the bytes are not confirmed. " +
      "`processing` = the bytes are confirmed and the preset's pipeline is running (a document being indexed, say). " +
      "`ready` = nothing further is owed. " +
      "Only `pending` is unreadable: a `processing` file can be downloaded, because its bytes are verified. A pipeline that fails still reaches `ready`, with the failure recorded against the step rather than the file."
  );
export type FileStatus = z.infer<typeof fileStatusSchema>;

// ── File content descriptor (files only; server-managed) ─────────────────────
export const fileContentSchema = z
  .object({
    contentType: z.string().describe("MIME type of the bytes."),
    size: z
      .number()
      .int()
      .nonnegative()
      .nullable()
      .describe("Byte size; null until upload completes."),
    checksum: z
      .string()
      .nullable()
      .describe("sha256 hex recorded on completion, when provided."),
  })
  .describe(
    "Server-managed file descriptor. Present for files, `null` for folders."
  );
export type FileContent = z.infer<typeof fileContentSchema>;
