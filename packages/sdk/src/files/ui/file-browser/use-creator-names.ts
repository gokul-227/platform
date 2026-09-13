"use client";

import { useMemo } from "react";
import type { FileResponse } from "../../../index";
import { useMemberNames } from "../../../tenancy/react/use-member-names";
import { useFileBrowser } from "./provider";

/**
 * Creator ids resolved to names, one request per browser rather than per row.
 * `createdBy` is a bare `user.id`, and null once the account is deleted.
 */
export function useCreatorNames(
  rows: readonly FileResponse[]
): Map<string, string> {
  const { fileScope } = useFileBrowser();
  const names = useMemberNames(fileScope);

  return useMemo(() => {
    const byId = new Map<string, string>();
    for (const row of rows) {
      const name = row.createdBy ? names.get(row.createdBy) : undefined;
      if (row.createdBy && name) {
        byId.set(row.createdBy, name);
      }
    }
    return byId;
  }, [rows, names]);
}
