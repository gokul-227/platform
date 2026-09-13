"use client";

import type { Permit } from "@aec-craft/platform-contracts";
import { useMemo } from "react";

import {
  useDeleteMeMetadata,
  useDeleteOrgMetadata,
  useDeleteProjectMetadata,
  useMe,
  useOrg,
  useProject,
  useSetMeMetadata,
  useSetOrgMetadata,
  useSetProjectMetadata,
} from "../../react";
import {
  resolveSetting,
  type SettingDef,
  type SettingSource,
  type SettingTier,
  TIER_WRITE_PERMIT,
} from "./setting";

/**
 * Where the setting is being read: which partitions are in play, and what the
 * caller holds on them. Passed in rather than pulled from the settings modal's
 * context, so a product team can resolve a convention anywhere in its app.
 */
export interface SettingScope {
  orgId: string | null;
  permits: Readonly<Partial<Record<Permit, boolean>>>;
  projectId: string | null;
}

export interface SettingState<T> {
  /** Whether the caller may write this tier here. */
  canWrite: (tier: SettingTier) => boolean;
  /** Drop this tier's value, so the tier above it applies again. */
  clear: (tier: SettingTier) => Promise<unknown>;
  /** True while a write is in flight, at any tier. */
  isPending: boolean;
  /** Write one tier. Rejects for a tier the setting does not declare. */
  set: (tier: SettingTier, value: T) => Promise<unknown>;
  /** Which tier the resolved value came from. */
  source: SettingSource;
  /** The value in force. */
  value: T;
  /** What each tier holds on its own, for a form that shows the inheritance. */
  values: Partial<Record<SettingTier, T | undefined>>;
}

/**
 * One setting, resolved across the tiers it declares.
 *
 * The organization sets a default, a project may differ from it, and a person
 * may differ again — which is what lets one firm work in millimetres, one job
 * for a US client work in feet, and one engineer read four decimals, without
 * any of the three arguing with the others.
 *
 * Reads come from the detail queries the surface already runs, so resolving a
 * setting costs no request of its own. Writes go to that tier's metadata bag
 * and are merge-writes, so two settings in the same bag do not overwrite each
 * other.
 */
export function useSetting<T>(
  def: SettingDef<T>,
  scope: SettingScope
): SettingState<T> {
  const { orgId, projectId, permits } = scope;
  const path = `settings.${def.key}`;

  const me = useMe();
  const org = useOrg(def.tiers.includes("org") ? orgId : null);
  const project = useProject(def.tiers.includes("project") ? projectId : null);

  const setOrg = useSetOrgMetadata();
  const setProject = useSetProjectMetadata();
  const setMe = useSetMeMetadata();
  const dropOrg = useDeleteOrgMetadata();
  const dropProject = useDeleteProjectMetadata();
  const dropMe = useDeleteMeMetadata();

  const values = useMemo(() => {
    const read = (bag: unknown): T | undefined =>
      readPath(bag, `${path}`) as T | undefined;
    return {
      org: def.tiers.includes("org") ? read(org.data?.metadata) : undefined,
      project: def.tiers.includes("project")
        ? read(project.data?.metadata)
        : undefined,
      user: def.tiers.includes("user") ? read(me.data?.metadata) : undefined,
    };
  }, [def.tiers, path, org.data, project.data, me.data]);

  const resolved = resolveSetting(def, values);

  const canWrite = (tier: SettingTier): boolean => {
    if (!def.tiers.includes(tier)) {
      return false;
    }
    if (tier === "org" && !orgId) {
      return false;
    }
    if (tier === "project" && !projectId) {
      return false;
    }
    const permit = TIER_WRITE_PERMIT[tier];
    return !permit || permits[permit] === true;
  };

  const write = (tier: SettingTier, value: T): Promise<unknown> => {
    if (tier === "org" && orgId) {
      return setOrg.mutateAsync({ orgId, keyPath: path, value });
    }
    if (tier === "project" && projectId) {
      return setProject.mutateAsync({ projectId, keyPath: path, value });
    }
    if (tier === "user") {
      return setMe.mutateAsync({ keyPath: path, value });
    }
    return Promise.reject(new Error(`No ${tier} in scope for \`${def.key}\`.`));
  };

  const drop = (tier: SettingTier): Promise<unknown> => {
    if (tier === "org" && orgId) {
      return dropOrg.mutateAsync({ orgId, keyPath: path });
    }
    if (tier === "project" && projectId) {
      return dropProject.mutateAsync({ projectId, keyPath: path });
    }
    if (tier === "user") {
      return dropMe.mutateAsync(path);
    }
    return Promise.reject(new Error(`No ${tier} in scope for \`${def.key}\`.`));
  };

  return {
    value: resolved.value,
    source: resolved.source,
    values,
    canWrite,
    set: (tier, value) =>
      def.tiers.includes(tier)
        ? write(tier, value)
        : Promise.reject(
            new Error(`\`${def.key}\` is not settable at the ${tier} level.`)
          ),
    clear: drop,
    isPending:
      setOrg.isPending ||
      setProject.isPending ||
      setMe.isPending ||
      dropOrg.isPending ||
      dropProject.isPending ||
      dropMe.isPending,
  };
}

/** Walk a dotted path into a metadata bag. */
function readPath(bag: unknown, path: string): unknown {
  let node: unknown = bag;
  for (const segment of path.split(".")) {
    if (typeof node !== "object" || node === null) {
      return;
    }
    node = (node as Record<string, unknown>)[segment];
  }
  return node;
}
