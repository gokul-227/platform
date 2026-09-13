# @aec-craft/platform-threads-api

Chat threads with an immutable message log and a managed generation-run
lifecycle (LangGraph executor, human-in-the-loop pause/resume, SSE streaming).
Embedded in the `apps/api` host.

Threads are org/project-scoped and private to their owner in v1. Messages are
insert-once: user messages are appended by clients, assistant messages are
written by completing a run.

## Routes

| Method | Path                                     | Notes                        |
| ------ | ---------------------------------------- | ---------------------------- |
| GET    | `/threads`                               | `?orgId=` xor `?projectId=`  |
| POST   | `/threads`                               | scope rides in the body      |
| GET    | `/threads/:threadId`                     | owner-checked                |
| PATCH  | `/threads/:threadId`                     | title / metadata             |
| DELETE | `/threads/:threadId`                     |                              |
| GET    | `/threads/:threadId/messages`            | oldest-first                 |
| POST   | `/threads/:threadId/messages`            | append                       |
| GET    | `/threads/:threadId/runs`                |                              |
| POST   | `/threads/:threadId/runs`                | start a generation           |
| GET    | `/threads/:threadId/runs/:runId`         |                              |
| GET    | `/threads/:threadId/runs/:runId/stream`  | SSE                          |
| POST   | `/threads/:threadId/runs/:runId/submit`  | answer a parked question     |
| POST   | `/threads/:threadId/runs/:runId/cancel`  |                              |
| PUT    | `/threads/:threadId/metadata/:keyPath`   | merge-write one key          |
| DELETE | `/threads/:threadId/metadata/:keyPath`   | remove one key               |
| PUT    | `/threads/:threadId/runs/:runId/metadata/:keyPath` | the run's own bag  |
| DELETE | `/threads/:threadId/runs/:runId/metadata/:keyPath` |                    |

## Layout

| Path                              | What lives there                              |
| --------------------------------- | --------------------------------------------- |
| `src/config/`                     | `ThreadsApiModule.forRoot()` + `Config`       |
| `src/database/`                   | drizzle schema (`thread`, `thread_message`, `thread_run`) |
| `src/modules/`            | thread CRUD + the permission guard            |
| `src/modules/messages/`   | the immutable log                             |
| `src/modules/runs/`       | run lifecycle, worker, executor, prompts, SSE bus |
| `src/modules/metadata/`   | the metadata KV sub-resource                  |
| `src/nest/`                       | NestJS bindings + the OpenAPI document spec   |
| `drizzle/`                        | migrations, journaled separately from every other slice |
| `bin/threads-api-migrate`         | the migrate CLI                               |

## Consuming

```ts
@Module({
  imports: [
    AuthorizationModule.forRoot({ databaseUrl, ketoReadUrl, ketoWriteUrl }),
    ThreadsApiModule.forRoot({
      databaseUrl: THREADS_DATABASE_URL,
      llm: { region: VERTEX_REGION },
    }),
  ],
  providers: [
    { provide: RunGraphSourceToken, useClass: PlatformRunGraphSource },
  ],
})
```

`llm` unset: the worker stays dormant and runs sit `queued` (a client may still
finalize them). `RunGraphSourceToken` is the optional graph capability the run
executor's tools use; without it, agents answer from general knowledge.
