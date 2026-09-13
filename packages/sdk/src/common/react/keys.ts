/**
 * Query-key factories — one per resource. Hierarchical so invalidating a
 * parent (`platformKeys.orgs.detail(id)`) cascades to every nested resource
 * scoped under it.
 *
 * The whole tree is rooted under `["platform"]` so a single
 * `invalidateQueries({ queryKey: platformKeys.all })` clears every cached
 * resource (e.g. on sign-out).
 */
export const platformKeys = {
  all: ["platform"] as const,

  me: () => [...platformKeys.all, "me"] as const,

  // What the caller holds across one tenant. Every standing write invalidates
  // it, because a standing change moves the permits a surface renders from.
  standings: (orgId: string) =>
    [...platformKeys.all, "standings", orgId] as const,

  members: {
    all: () => [...platformKeys.all, "members"] as const,
    list: (
      scope:
        | { type: "org"; orgId: string }
        | { type: "project"; projectId: string }
    ) =>
      scope.type === "org"
        ? ([...platformKeys.members.all(), "by-org", scope.orgId] as const)
        : ([
            ...platformKeys.members.all(),
            "by-project",
            scope.projectId,
          ] as const),
  },

  orgs: {
    all: () => [...platformKeys.all, "orgs"] as const,
    list: () => [...platformKeys.orgs.all(), "list"] as const,
    detail: (orgId: string) => [...platformKeys.orgs.all(), orgId] as const,
  },

  projects: {
    all: () => [...platformKeys.all, "projects"] as const,
    list: () => [...platformKeys.projects.all(), "list"] as const,
    listByOrg: (orgId: string) =>
      [...platformKeys.projects.all(), "by-org", orgId] as const,
    detail: (projectId: string) =>
      [...platformKeys.projects.all(), projectId] as const,
  },

  // Graph: resource-centric domain. Lists are keyed by scope (a list under
  // `{type: project, projectId}` is a different page from a list under
  // `{type: org, orgId}`). Detail keys use the globally-unique node / edge id
  // directly — no scope needed, since the same id never repeats across scopes.
  // Mutations whose post-state straddles scopes (delete, cross-scope update)
  // invalidate at `nodes.all()` / `edges.all()`.
  // Audit rooted globally so an org-scoped audit feed key and a project-
  // scoped one tier cleanly. Scope is part of the key so swapping orgs in
  // the UI invalidates only the relevant queries.
  audit: {
    all: () => [...platformKeys.all, "audit"] as const,
    forOrg: (orgId: string) =>
      [...platformKeys.audit.all(), "org", orgId] as const,
    listForOrg: (orgId: string) =>
      [...platformKeys.audit.forOrg(orgId), "list"] as const,
    detailForOrg: (orgId: string, eventId: string) =>
      [...platformKeys.audit.forOrg(orgId), eventId] as const,
    forProject: (projectId: string) =>
      [...platformKeys.audit.all(), "project", projectId] as const,
    listForProject: (projectId: string) =>
      [...platformKeys.audit.forProject(projectId), "list"] as const,
    detailForProject: (projectId: string, eventId: string) =>
      [...platformKeys.audit.forProject(projectId), eventId] as const,
  },

  graph: {
    all: () => [...platformKeys.all, "graph"] as const,
    nodes: {
      all: () => [...platformKeys.graph.all(), "nodes"] as const,
      list: (
        scope:
          | { type: "org"; orgId: string }
          | { type: "project"; projectId: string }
      ) =>
        scope.type === "org"
          ? ([
              ...platformKeys.graph.nodes.all(),
              "list",
              "by-org",
              scope.orgId,
            ] as const)
          : ([
              ...platformKeys.graph.nodes.all(),
              "list",
              "by-project",
              scope.projectId,
            ] as const),
      lists: () => [...platformKeys.graph.nodes.all(), "list"] as const,
      detail: (nodeId: string) =>
        [...platformKeys.graph.nodes.all(), "detail", nodeId] as const,
    },
    edges: {
      all: () => [...platformKeys.graph.all(), "edges"] as const,
      list: (
        scope:
          | { type: "org"; orgId: string }
          | { type: "project"; projectId: string }
      ) =>
        scope.type === "org"
          ? ([
              ...platformKeys.graph.edges.all(),
              "list",
              "by-org",
              scope.orgId,
            ] as const)
          : ([
              ...platformKeys.graph.edges.all(),
              "list",
              "by-project",
              scope.projectId,
            ] as const),
      lists: () => [...platformKeys.graph.edges.all(), "list"] as const,
      detail: (edgeId: string) =>
        [...platformKeys.graph.edges.all(), "detail", edgeId] as const,
    },
  },
  files: {
    all: () => [...platformKeys.all, "files"] as const,
    list: (
      scope:
        | { type: "org"; orgId: string }
        | { type: "project"; projectId: string }
    ) =>
      scope.type === "org"
        ? ([
            ...platformKeys.files.all(),
            "list",
            "by-org",
            scope.orgId,
          ] as const)
        : ([
            ...platformKeys.files.all(),
            "list",
            "by-project",
            scope.projectId,
          ] as const),
    lists: () => [...platformKeys.files.all(), "list"] as const,
    detail: (fileId: string) =>
      [...platformKeys.files.all(), "detail", fileId] as const,
    presets: () => [...platformKeys.files.all(), "presets"] as const,
    // Retrieval is keyed by scope and by the rung, because the four rungs answer
    // the same question in different shapes and must not share a cache entry.
    search: (
      scope:
        | { type: "org"; orgId: string }
        | { type: "project"; projectId: string },
      rung: "search" | "retrieve" | "context" | "ask"
    ) =>
      scope.type === "org"
        ? ([...platformKeys.files.all(), rung, "by-org", scope.orgId] as const)
        : ([
            ...platformKeys.files.all(),
            rung,
            "by-project",
            scope.projectId,
          ] as const),
    indexState: (fileId: string) =>
      [...platformKeys.files.all(), "index", fileId] as const,
  },

  // Threads: list keyed by scope (owner-filtered server-side). Messages and
  // runs are nested under the thread id; a run detail key is what the poll hook
  // watches for completion.
  threads: {
    all: () => [...platformKeys.all, "threads"] as const,
    list: (
      scope:
        | { type: "org"; orgId: string }
        | { type: "project"; projectId: string }
    ) =>
      scope.type === "org"
        ? ([
            ...platformKeys.threads.all(),
            "list",
            "by-org",
            scope.orgId,
          ] as const)
        : ([
            ...platformKeys.threads.all(),
            "list",
            "by-project",
            scope.projectId,
          ] as const),
    lists: () => [...platformKeys.threads.all(), "list"] as const,
    detail: (threadId: string) =>
      [...platformKeys.threads.all(), "detail", threadId] as const,
    messages: {
      all: (threadId: string) =>
        [...platformKeys.threads.all(), threadId, "messages"] as const,
      list: (threadId: string) =>
        [...platformKeys.threads.messages.all(threadId), "list"] as const,
      detail: (threadId: string, messageId: string) =>
        [...platformKeys.threads.messages.all(threadId), messageId] as const,
    },
    runs: {
      all: (threadId: string) =>
        [...platformKeys.threads.all(), threadId, "runs"] as const,
      list: (threadId: string) =>
        [...platformKeys.threads.runs.all(threadId), "list"] as const,
      detail: (threadId: string, runId: string) =>
        [...platformKeys.threads.runs.all(threadId), runId] as const,
    },
  },

  objects: {
    all: () => [...platformKeys.all, "objects"] as const,
    list: (
      scope:
        | { type: "org"; orgId: string }
        | { type: "project"; projectId: string }
        | null
    ) =>
      [
        ...platformKeys.objects.all(),
        "list",
        scope?.type === "org" ? scope.orgId : (scope?.projectId ?? ""),
      ] as const,
    detail: (objectId: string) =>
      [...platformKeys.objects.all(), objectId] as const,
  },

  rules: {
    all: () => [...platformKeys.all, "rules"] as const,
    list: (
      scope:
        | { type: "org"; orgId: string }
        | { type: "project"; projectId: string }
        | null
    ) =>
      [
        ...platformKeys.rules.all(),
        "list",
        scope?.type === "org" ? scope.orgId : (scope?.projectId ?? ""),
      ] as const,
    detail: (ruleId: string) => [...platformKeys.rules.all(), ruleId] as const,
  },

  // Keyed on the question, not just the project: an analysis is a pure function
  // of the model and the input, so two callers asking the same thing share one
  // answer and a changed input is a different key rather than an invalidation.
  analysis: {
    all: () => [...platformKeys.all, "analysis"] as const,
    run: (projectId: string, kind: string, input: unknown) =>
      [...platformKeys.analysis.all(), projectId, kind, input] as const,
  },
} as const;
