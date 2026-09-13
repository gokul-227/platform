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
import { useDeleteOrg, useOrg, useUpdateOrg } from "../../../../../react";
import { useSettings } from "../../../provider";

export function OrgGeneralSection() {
  const { orgId, permits, setScope } = useSettings();
  const org = useOrg(orgId);
  const updateOrg = useUpdateOrg();
  const deleteOrg = useDeleteOrg();
  const isLoading = org.isLoading;
  const canDelete = permits.admin;

  const remove = async (id: string) => {
    try {
      await deleteOrg.mutateAsync(id);
      // The active org is gone; drop back to the user's own account scope.
      setScope("account");
    } catch (e) {
      toastError(e);
    }
  };

  return (
    <Section
      description="Your organization's name and URL slug."
      title="General"
    >
      {isLoading ? (
        <SectionLoading />
      ) : org.error || !org.data ? (
        <SectionError
          error={org.error}
          onRetry={() => void org.refetch()}
          subject="this organization"
        />
      ) : (
        <div className="flex flex-col gap-8">
          <FieldForm
            fields={[
              { name: "name", label: "Name" },
              { name: "slug", label: "Slug", hint: "Appears in your URLs." },
            ]}
            key={org.data.id}
            onError={(e) => toastError(e)}
            onSave={(field, value) =>
              updateOrg.mutateAsync({
                orgId: org.data!.id,
                input: { [field]: value } as { name?: string; slug?: string },
              })
            }
            values={{ name: org.data.name, slug: org.data.slug }}
          />

          {canDelete ? (
            <DangerZone
              action={
                <AlertDialog>
                  <AlertDialogTrigger
                    render={
                      <Button
                        disabled={deleteOrg.isPending}
                        size="sm"
                        variant="destructive"
                      />
                    }
                  >
                    Delete organization
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>
                        Delete “{org.data.name}”?
                      </AlertDialogTitle>
                      <AlertDialogDescription>
                        This permanently removes the organization and every
                        project in it, for everyone. This can't be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        className={buttonVariants({ variant: "destructive" })}
                        onClick={() => void remove(org.data!.id)}
                      >
                        Delete organization
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              }
              description="Permanently delete this organization and every project in it. This can't be undone."
              title="Delete organization"
            />
          ) : null}
        </div>
      )}
    </Section>
  );
}
