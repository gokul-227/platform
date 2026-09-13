import type { ApiDocumentSpec } from "@aec-craft/platform-common/nest";

import { FilesApiModule } from "../config/api.module";
import { FileIndexModule } from "../modules/index/file.index.module";
import { FileMetadataModule } from "../modules/metadata/file.metadata.module";

export const filesApiDocument: ApiDocumentSpec = {
  include: [FilesApiModule, FileIndexModule, FileMetadataModule],
  path: "openapi-files",
  sourceTitle: "Files",
  title: "Files API",
  tags: [
    {
      name: "Files",
      description:
        "The file tree: files and folders, one level at a time. Read a scope with `?orgId=` or `?projectId=`; a project read hydrates the parent org's shared library and `?scope=project` narrows to the project's own. Bytes never pass through the API — a create returns an upload ticket and a download returns a signed URL.",
    },
    {
      name: "File index",
      description:
        "One file's place in the document index. Submitting is asynchronous: the call records the intent and a worker extracts, chunks and embeds the text, so the state moves `pending` to `indexed` on its own. Uploads under a preset whose pipeline includes `index` are submitted for you.",
    },
  ],
};
