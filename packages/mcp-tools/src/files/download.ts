/**
 * `files_download` — proxy to `GET /files/{fileId}/download` on apps/api.
 *
 * Hands back a short-lived signed URL rather than bytes: the transport speaks
 * JSON, and the bytes come straight from the bucket. The URL is a read
 * capability, so it belongs in the agent's next fetch and nowhere durable.
 */

import { downloadFileResponseSchema } from "@aec-craft/platform-contracts";
import { z } from "zod";

import { defineTool } from "../common/descriptor";

const filesDownloadInputSchema = z.object({
  fileId: z.string().uuid().describe("The file id. Folders have no bytes."),
});

export const filesDownloadTool = defineTool({
  name: "files_download",
  description:
    "Get a short-lived signed URL for a file's bytes, to fetch directly from " +
    "storage. Only a `ready` file has any: a `pending` one answers " +
    "`FILE_NOT_READY`, and a folder `FILE_NOT_A_FILE`. The URL expires, so " +
    "fetch it now rather than keeping it.",
  inputSchema: filesDownloadInputSchema,
  outputSchema: downloadFileResponseSchema,
  resource: "api",
  endpoint: { method: "GET", path: "/files/{fileId}/download" },
  scopes: ["openid"],
});
