import {
  updateUserInputSchema,
  userResponseSchema,
} from "@aec-craft/platform-contracts";

import { defineTool } from "../../common/descriptor";

export const meUpdateTool = defineTool({
  name: "me_update",
  description:
    "Update the current user's avatar. Affects only the caller's own row; no " +
    "org/project scope to think about. Name and email are identity traits and " +
    "cannot be set here: they are changed at the sign-in provider and reach " +
    "the platform through its webhook.",
  inputSchema: updateUserInputSchema,
  outputSchema: userResponseSchema,
  resource: "api",
  endpoint: { method: "PATCH", path: "/me" },
  scopes: ["openid"],
});
