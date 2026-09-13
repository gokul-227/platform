import type { ApiDocumentSpec } from "@aec-craft/platform-common/nest";

import { ThreadsApiModule } from "../config/api.module";
import { ThreadMessageModule } from "../modules/messages/thread.message.module";
import { ThreadRunModule } from "../modules/runs/thread.run.module";
import { ThreadModule } from "../modules/thread.module";

export const threadsApiDocument: ApiDocumentSpec = {
  include: [
    ThreadsApiModule,
    ThreadModule,
    ThreadMessageModule,
    ThreadRunModule,
  ],
  path: "openapi-threads",
  sourceTitle: "Threads",
  title: "Threads API",
  tags: [
    {
      name: "Threads",
      description:
        "Chat threads: org/project-scoped conversations, private to their owner. A thread carries an immutable message log (see **Thread messages**) and a managed generation-run lifecycle (see **Thread runs**).",
    },
    {
      name: "Thread messages",
      description:
        "The immutable message log of a thread, oldest-first. User messages are appended by clients; assistant messages are written by completing a run — messages are never edited or deleted.",
    },
    {
      name: "Thread runs",
      description:
        "The generation lifecycle: creating a run gets a server-generated reply (LangGraph executor over the project's building graph). Runs stream over SSE, can pause to ask the user a question (`requires_action` -> `submit`), and record model usage.",
    },
  ],
};
