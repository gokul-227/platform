"use client";

import type {
  GroupStanding,
  MemberSource,
  Scope,
} from "@aec-craft/platform-contracts";
import {
  STANDING_LABELS,
  STANDINGS,
  standingRank,
} from "@aec-craft/platform-contracts";
import {
  DataTable,
  type DataTableColumn,
  type TableQuery,
} from "@aec-craft/ui/components/blocks/data-table";
import { Section } from "@aec-craft/ui/components/blocks/section";
import { Spinner } from "@aec-craft/ui/components/custom/spinner";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@aec-craft/ui/components/primitives/avatar";
import { Button } from "@aec-craft/ui/components/primitives/button";
import { Input } from "@aec-craft/ui/components/primitives/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@aec-craft/ui/components/primitives/select";
import { TableCell, TableRow } from "@aec-craft/ui/components/primitives/table";
import { UserPlusIcon } from "@aec-craft/ui/icons";
import { initials } from "@aec-craft/ui/lib/format";
import { useForm } from "@tanstack/react-form";
import { useMemo, useState } from "react";
import { SectionError, toastError } from "../../../../../common/ui/states";
import {
  useAddMember,
  useMembers,
  useRemoveMember,
  useSetMemberStanding,
} from "../../../../../react";
import { useSettings } from "../../../provider";
import { MemberActionsMenu, type MemberRow } from "./member.actions";
import { grantableStandings, isLastOwner } from "./member.rules";
import { useInheritedFrom } from "./use-inherited-from";

/**
 * Who can open the active scope, and at what standing.
 *
 * Everyone who reaches it, not only those added to it: a standing traverses
 * down, so an organization's owner administers every project without having
 * been added to one. A project list of its own people alone left the person with
 * the most authority over it invisible, and made its one direct owner look like
 * the only owner there is. Those rows are changed on the organization.
 *
 * There is no invite flow and no role picker. Someone is added by their email
 * address, which the server resolves against the directory, at a standing
 * strictly below the caller's own; the five standings are the whole vocabulary.
 *
 * Sorting and filtering are in memory on purpose. The list is one Keto call
 * that returns every tuple with no cursor and no ordering, so there is no page
 * to ask the server for: filtering server-side would mean fetching all of it
 * and discarding some before rendering the rest. A tenant large enough to need
 * real pagination needs the tuple read to change first.
 */
export function MembersSection() {
  const { meSubject, orgId, permits, projectId, scope } = useSettings();
  const place = scope === "project" ? "project" : "organization";
  const partition: Scope | null =
    scope === "project" && projectId
      ? { type: "project", projectId }
      : orgId
        ? { type: "org", orgId }
        : null;
  const [query, setQuery] = useState<TableQuery>({
    sort: { key: "person", dir: "asc" },
    filters: {},
  });

  const members = useMembers(partition);
  const addMember = useAddMember();
  const setStanding = useSetMemberStanding();
  const removeMember = useRemoveMember();

  const grantable = grantableStandings(permits);
  const all: MemberRow[] = useMemo(
    () => members.data?.items ?? [],
    [members.data]
  );

  const rows = useMemo(() => {
    const needle = (query.filters.person ?? "").trim().toLowerCase();
    const standings = (query.filters.standing ?? "").split(",").filter(Boolean);
    const filtered = all.filter((row) => {
      const matchesPerson =
        !needle ||
        [row.name, row.email, row.subject].some((value) =>
          value?.toLowerCase().includes(needle)
        );
      return (
        matchesPerson &&
        (standings.length === 0 || standings.includes(row.standing))
      );
    });
    const sort = query.sort;
    if (!sort) {
      return filtered;
    }
    const direction = sort.dir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const compared =
        sort.key === "standing"
          ? // The ladder, not the alphabet: owners belong at one end of it.
            standingRank(a.standing) - standingRank(b.standing)
          : personLabel(a).localeCompare(personLabel(b));
      return compared * direction;
    });
  }, [all, query]);

  const form = useForm({
    defaultValues: {
      email: "",
      standing: (grantable.at(-1) ?? "viewer") as GroupStanding,
    },
    onSubmit: async ({ value, formApi }) => {
      if (!partition) {
        return;
      }
      try {
        await addMember.mutateAsync({
          scope: partition,
          input: { email: value.email.trim(), standing: value.standing },
        });
        formApi.reset();
      } catch (error) {
        toastError(error);
      }
    },
  });

  const columns: DataTableColumn[] = [
    {
      label: "Person",
      key: "person",
      sortable: true,
      filter: { type: "search", placeholder: "Search people…" },
    },
    {
      label: "Standing",
      key: "standing",
      sortable: true,
      filter: {
        type: "select",
        options: STANDINGS.map((standing) => ({
          value: standing,
          label: STANDING_LABELS[standing],
        })),
        placeholder: "Any standing",
      },
    },
    { label: "", key: "actions", className: "text-right" },
  ];

  return (
    <Section
      description={`Who can open this ${place}, and what they can do in it.`}
      title="Members"
    >
      {permits.manage ? (
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void form.handleSubmit();
          }}
        >
          <form.Field name="email">
            {(field) => (
              <Input
                aria-label="Email"
                autoComplete="off"
                className="min-w-64 flex-1"
                onChange={(event) => field.handleChange(event.target.value)}
                placeholder="name@company.com"
                type="email"
                value={field.state.value}
              />
            )}
          </form.Field>
          <form.Field name="standing">
            {(field) => (
              <Select
                onValueChange={(value) =>
                  field.handleChange(value as GroupStanding)
                }
                value={field.state.value}
              >
                <SelectTrigger aria-label="Standing" className="w-40">
                  {/* Base UI renders the raw value unless given a child. */}
                  <SelectValue>
                    {(value) => STANDING_LABELS[value as GroupStanding]}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {grantable.map((standing) => (
                      <SelectItem key={standing} value={standing}>
                        {STANDING_LABELS[standing]}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            )}
          </form.Field>
          <form.Subscribe selector={(state) => state.values.email.trim()}>
            {(email) => (
              <Button disabled={addMember.isPending || !email} type="submit">
                {addMember.isPending ? <Spinner /> : <UserPlusIcon />}
                Add
              </Button>
            )}
          </form.Subscribe>
        </form>
      ) : null}

      {members.error ? (
        <SectionError
          error={members.error}
          onRetry={() => void members.refetch()}
          subject="the member list"
        />
      ) : (
        <DataTable
          columns={columns}
          empty={
            all.length === 0
              ? "Nobody has access yet."
              : "Nobody matches your search."
          }
          isLoading={members.isLoading}
          onQueryChange={setQuery}
          query={query}
        >
          {rows.map((row) => (
            <TableRow key={row.subject}>
              <TableCell>
                <div className="flex items-center gap-3">
                  {/* Sized to the two-line cell beside it. The fallback carries
                      its own text size: without one the initials inherit the
                      table's, which is smaller than the avatar and reads as a
                      rendering fault rather than a choice. */}
                  <Avatar className="size-9">
                    <AvatarImage alt="" src={row.picture ?? undefined} />
                    <AvatarFallback className="text-xs">
                      {initials(row.name ?? row.email ?? row.subject)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <div className="truncate">
                      {row.name ?? row.email}
                      {/* Your own row has no menu; say which row is yours, or
                          the rule reads as a missing control. */}
                      {row.userId === meSubject ? (
                        <span className="ml-2 text-muted-foreground text-xs">
                          You
                        </span>
                      ) : null}
                    </div>
                    {row.email && row.name ? (
                      <div className="truncate text-muted-foreground text-xs">
                        {row.email}
                      </div>
                    ) : null}
                  </div>
                </div>
              </TableCell>
              <TableCell>
                <div className="flex flex-col items-start gap-0.5">
                  <span>{STANDING_LABELS[row.standing]}</span>
                  <InheritedFrom source={row.source} />
                </div>
              </TableCell>
              <TableCell className="text-right">
                <MemberActionsMenu
                  isOnlyOwner={isLastOwner(all, row.subject)}
                  isSelf={row.userId === meSubject}
                  member={row}
                  onChangeStanding={(standing) => {
                    if (partition) {
                      setStanding
                        .mutateAsync({
                          scope: partition,
                          subject: row.subject,
                          standing,
                        })
                        .catch(toastError);
                    }
                  }}
                  onRemove={() => {
                    if (partition) {
                      removeMember
                        .mutateAsync({
                          scope: partition,
                          subject: row.subject,
                        })
                        .catch(toastError);
                    }
                  }}
                />
              </TableCell>
            </TableRow>
          ))}
        </DataTable>
      )}
    </Section>
  );
}

function personLabel(row: MemberRow): string {
  return (row.name ?? row.email ?? row.subject).toLowerCase();
}

/**
 * Where an inherited standing sits, as a way to get there when the caller can
 * act on it and as plain text when they cannot.
 *
 * Its own component because the hook behind it runs per row.
 */
function InheritedFrom({ source }: { source: MemberSource }) {
  const goToSource = useInheritedFrom(source);

  if (source !== "inherited") {
    return null;
  }
  if (!goToSource) {
    return (
      <span className="text-muted-foreground text-xs">
        via the organization
      </span>
    );
  }
  // A bare button, not `Button`: its padding and height set the line apart from
  // the plain one this renders when the organization cannot be reached, and from the
  // email under a name in the cell beside it. The underline on hover is what
  // says it can be followed.
  return (
    <button
      className="text-left text-muted-foreground text-xs underline-offset-2 hover:text-foreground hover:underline"
      onClick={goToSource}
      type="button"
    >
      via the organization
    </button>
  );
}
