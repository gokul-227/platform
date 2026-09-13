"use client";

import { Panel } from "@aec-craft/ui/components/blocks/panel";
import { Button } from "@aec-craft/ui/components/primitives/button";
import {
  Dialog,
  DialogClose,
  DialogDescription,
  DialogPanel,
  DialogTitle,
  DialogTrigger,
} from "@aec-craft/ui/components/primitives/dialog";
import { toast } from "@aec-craft/ui/components/primitives/sonner";
import { XIcon } from "@aec-craft/ui/icons";
import { toastError } from "@aec-craft/ui/lib/toast";
import {
  type ReactElement,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  type BreadcrumbProject,
  ScopeBreadcrumb,
} from "../../../common/ui/scope-breadcrumb";
import type { FileResponse, FileScope } from "../../../index";
import { useOrgs } from "../../../tenancy/react/org.hooks";
import { useCallerStanding } from "../../../tenancy/react/use-caller-standing";
import { useUpdateFile } from "../../react/file.hooks";
import { UploadFilePicker } from "../upload-file-picker";
import { UploadStatusList } from "../upload-status-list";
import { useUploadSurface } from "../use-upload-surface";
import { FOLDERS_FIRST } from "./file.grid";
import { FileTree } from "./file.tree";
import {
  FileBrowserProvider,
  type FileLevelQuery,
  type FolderDraft,
} from "./provider";

export interface FileBrowserProps {
  defaultOpen?: boolean;
  /** Project to open at when the scope is "project" (id + name). */
  defaultProject?: BreadcrumbProject | null;
  /** Scope to open at. Defaults to "project" when a project is given.
   *  To re-open at a different scope, remount with a changing `key`. */
  defaultScope?: FileBrowserScope;
  onOpenChange?: (open: boolean) => void;
  open?: boolean;
  /** Pin a specific organization; defaults to the caller's first org. */
  orgId?: string;
  /** Element that opens the browser (rendered as the dialog trigger). */
  trigger?: ReactElement;
}

export type FileBrowserScope = "org" | "project";

/** Stands in while the active org resolves. Every path that could send bytes
 *  checks `fileScope` first, so it is never the scope of a real request. */
const NO_SCOPE: FileScope = { type: "org", orgId: "" };

/**
 * The file tree of one org or one project, as a modal over any route.
 *
 * A project shows its own files. The org library it inherits is the org scope's
 * view, reachable from the breadcrumb, rather than hydrated into the project's
 * tree, so what is on screen always belongs to what the breadcrumb names.
 */
export function FileBrowser({
  open,
  defaultOpen,
  onOpenChange,
  trigger,
  orgId: orgIdProp,
  defaultScope,
  defaultProject = null,
}: FileBrowserProps) {
  const [project, setProject] = useState<BreadcrumbProject | null>(
    defaultProject
  );
  const [scope, setScope] = useState<FileBrowserScope>(
    defaultScope ?? (defaultProject ? "project" : "org")
  );
  const [orgId, setOrgId] = useState<string | null>(orgIdProp ?? null);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [moving, setMoving] = useState<FileResponse | null>(null);
  const [dragging, setDragging] = useState<FileResponse | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [draft, setDraft] = useState<FolderDraft | null>(null);
  const [search, setSearch] = useState("");

  const orgs = useOrgs();
  const activeOrgId = orgId ?? orgs.data?.items[0]?.id ?? null;
  const projectId = scope === "project" ? (project?.id ?? null) : null;

  const { permits, ready } = useCallerStanding({
    orgId: activeOrgId,
    projectId,
  });

  const fileScope: FileScope | null = useMemo(() => {
    if (projectId) {
      return { type: "project", projectId };
    }
    return activeOrgId ? { type: "org", orgId: activeOrgId } : null;
  }, [activeOrgId, projectId]);

  // A project list would otherwise merge the parent org's library into it.
  const listQuery: FileLevelQuery = useMemo(
    () => ({
      sort: FOLDERS_FIRST,
      ...(projectId ? { scope: "project" as const } : {}),
    }),
    [projectId]
  );

  // One upload surface for the whole browser, wherever the files came from: the
  // toolbar, a folder's menu, or a drop. Its target is state rather than a
  // parameter because the batch reads its options when it starts.
  const [uploadTarget, setUploadTarget] = useState<string | null>(null);
  const [queued, setQueued] = useState<File[] | null>(null);
  const uploadSurface = useUploadSurface({
    multiple: true,
    // A refused file (wrong type, over the ceiling, a name already taken) and a
    // dead service are both failures the same bytes will hit again, so they are
    // told once and let go. A failure that can continue where it stopped keeps
    // its row and its retry.
    //
    // Said with its reason, not around it: `toastError` reads `message` off an
    // Error, and an upload failure is a plain `{ code, description, message }`,
    // so every one of them came out as the fallback sentence.
    onError: (state) => {
      if (!state.resumable) {
        // The file is the title and the reason is the description, which is the
        // shape a toast is built for: a name and a sentence, not one string with
        // a colon in it.
        toast.error(state.name, {
          description: state.error.description ?? state.error.message,
        });
      }
    },
    parentId: uploadTarget,
    scope: fileScope ?? NO_SCOPE,
  });
  const uploadRows = uploadSurface.uploads.items.filter(
    (item) => item.state.status !== "failed" || item.state.resumable
  );
  const submit = useRef(uploadSurface.submit);
  submit.current = uploadSurface.submit;

  // A drop names its folder and its files in the same event, so the target is
  // committed first and the batch starts on the render that carries it.
  useEffect(() => {
    if (!queued) {
      return;
    }
    setQueued(null);
    submit.current(queued);
  }, [queued]);

  // The picker can open in the same breath: choosing files is a separate,
  // later event, by which time the target has landed.
  const picker = uploadSurface.pickerRef;
  const requestUpload = useCallback(
    (parentId: string | null) => {
      setUploadTarget(parentId);
      picker.current?.click();
    },
    [picker]
  );

  const startUpload = useCallback((parentId: string | null, files: File[]) => {
    if (files.length === 0) {
      return;
    }
    setUploadTarget(parentId);
    setQueued(files);
  }, []);

  const update = useUpdateFile();
  const moveInto = useCallback(
    (file: FileResponse, parentId: string | null) => {
      update.mutate(
        { fileId: file.id, input: { parentId } },
        { onError: (error) => toastError(error) }
      );
    },
    [update]
  );

  const toggle = useCallback((fileId: string) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (!next.delete(fileId)) {
        next.add(fileId);
      }
      return next;
    });
  }, []);
  const expand = useCallback((fileId: string) => {
    setExpanded((current) => new Set(current).add(fileId));
  }, []);

  // A hit found by search is somewhere the tree is not showing, so revealing it
  // is: open its ancestors, put the search away, and leave the tree where it is
  // now standing. The path comes from the search response, so no walk is needed.
  const reveal = useCallback((file: FileResponse) => {
    setExpanded((current) => {
      const next = new Set(current);
      for (const ancestor of file.path ?? []) {
        next.add(ancestor.id);
      }
      if (file.type === "folder") {
        next.add(file.id);
      }
      return next;
    });
    setSearch("");
  }, []);

  // One draft at a time: a second would be two fields asking the same question.
  const startDraft = useCallback(
    (parentId: string | null) => setDraft({ parentId }),
    []
  );
  const endDraft = useCallback(() => setDraft(null), []);

  // Switching scope leaves the old tree's open folders behind.
  const selectOrg = (id: string) => {
    setOrgId(id);
    setScope("org");
    setProject(null);
    setExpanded(new Set());
    setDraft(null);
    setSearch("");
  };
  const openProject = (id: string, name: string) => {
    setScope("project");
    setProject({ id, name });
    setExpanded(new Set());
    setDraft(null);
    setSearch("");
  };

  return (
    <Dialog defaultOpen={defaultOpen} onOpenChange={onOpenChange} open={open}>
      {trigger ? <DialogTrigger render={trigger} /> : null}
      <DialogPanel>
        <DialogTitle className="sr-only">Files</DialogTitle>
        <DialogDescription className="sr-only">
          Browse the files and folders of your organization and its projects.
        </DialogDescription>

        <FileBrowserProvider
          value={{
            canWrite: ready && permits.write === true,
            draft,
            dragging,
            dropTarget,
            endDraft,
            expand,
            fileScope,
            isExpanded: (fileId) => expanded.has(fileId),
            listQuery,
            moveInto,
            moving,
            orgId: activeOrgId,
            renamingId,
            reveal,
            search,
            requestUpload,
            setDragging,
            setDropTarget,
            setMoving,
            setRenamingId,
            setSearch,
            startDraft,
            startUpload,
            toggle,
            uploadsUnavailable: uploadSurface.isUnavailable,
          }}
        >
          <Panel
            header={
              <>
                <ScopeBreadcrumb
                  onOpenProject={openProject}
                  onSelectOrg={selectOrg}
                  orgId={activeOrgId}
                  project={project}
                  scope={scope}
                />
                <DialogClose
                  render={
                    <Button
                      aria-label="Close"
                      className="bg-foreground/[0.06] text-muted-foreground hover:bg-foreground/[0.12] hover:text-foreground"
                      size="icon-sm"
                      variant="secondary"
                    />
                  }
                >
                  <XIcon />
                </DialogClose>
              </>
            }
          >
            <div className="flex min-h-0 flex-1 flex-col p-5 sm:p-8">
              <FileTree />
            </div>

            <UploadFilePicker
              multiple
              onFiles={uploadSurface.submit}
              pickerRef={uploadSurface.pickerRef}
            />

            {uploadSurface.rejected || uploadRows.length > 0 ? (
              <div className="flex flex-col gap-2 border-foreground/10 border-t px-5 py-3 sm:px-8">
                {uploadSurface.rejected ? (
                  <p className="text-destructive text-xs" role="alert">
                    {uploadSurface.rejected}
                  </p>
                ) : null}
                <UploadStatusList
                  layout="strip"
                  uploads={{ ...uploadSurface.uploads, items: uploadRows }}
                />
              </div>
            ) : null}
          </Panel>
        </FileBrowserProvider>
      </DialogPanel>
    </Dialog>
  );
}
