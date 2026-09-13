"use client";

import { DangerZone } from "@aec-craft/ui/components/blocks/danger-zone";
import { FieldForm } from "@aec-craft/ui/components/blocks/field-form";
import { Section } from "@aec-craft/ui/components/blocks/section";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@aec-craft/ui/components/primitives/alert-dialog";
import {
  Button,
  buttonVariants,
} from "@aec-craft/ui/components/primitives/button";
import {
  SectionError,
  SectionLoading,
  toastError,
} from "../../../../../common/ui/states";
import {
  useDeleteProject,
  useProject,
  useUpdateProject,
} from "../../../../../react";
import { useSettings } from "../../../provider";

export function ProjectGeneralSection() {
  const { projectId, permits, setScope } = useSettings();
  const project = useProject(projectId);
  const updateProject = useUpdateProject();
  const deleteProject = useDeleteProject();
  const isLoading = project.isLoading;
  const canDelete = permits.admin;

  const remove = async (id: string) => {
    try {
      await deleteProject.mutateAsync(id);
      // The active project is gone; drop back to the org's settings.
      setScope("org");
    } catch (e) {
      toastError(e);
    }
  };

  return (
    <Section description="Your project's name and URL slug." title="General">
      {isLoading ? (
        <SectionLoading />
      ) : project.error || !project.data ? (
        <SectionError
          error={project.error}
          onRetry={() => void project.refetch()}
          subject="this project"
        />
      ) : (
        <div className="flex flex-col gap-8">
          <FieldForm
            fields={[
              { name: "name", label: "Name" },
              { name: "slug", label: "Slug", hint: "Appears in your URLs." },
            ]}
            key={project.data.id}
            onError={(e) => toastError(e)}
            onSave={(field, value) =>
              updateProject.mutateAsync({
                projectId: project.data!.id,
                input: { [field]: value } as { name?: string; slug?: string },
              })
            }
            values={{ name: project.data.name, slug: project.data.slug }}
          />

          {canDelete ? (
            <DangerZone
              action={
                <AlertDialog>
                  <AlertDialogTrigger
                    render={
                      <Button
                        disabled={deleteProject.isPending}
                        size="sm"
                        variant="destructive"
                      />
                    }
                  >
                    Delete project
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>
                        Delete “{project.data.name}”?
                      </AlertDialogTitle>
                      <AlertDialogDescription>
                        This permanently removes the project and everything in
                        it, for everyone. This can't be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        className={buttonVariants({ variant: "destructive" })}
                        onClick={() => void remove(project.data!.id)}
                      >
                        Delete project
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              }
              description="Permanently delete this project and everything in it: its files, models and access. This can't be undone."
              title="Delete project"
            />
          ) : null}
        </div>
      )}
    </Section>
  );
}
