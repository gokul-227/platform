import { userResponseSchema } from "@aec-craft/platform-contracts";
import { z } from "zod";

import { defineTool } from "../../common/descriptor";

export const meGetTool = defineTool({
  name: "me_get",
  description:
    "Fetch the current user's profile (the identity behind the Bearer token). " +
    "Useful for the agent to learn 'who am I on this platform' before " +
    "deciding which org/project scopes to act in. No path params; the server " +
    "reads the subject from the token.",
  inputSchema: z.object({}),
  outputSchema: userResponseSchema,
  resource: "api",
  endpoint: { method: "GET", path: "/me" },
  scopes: ["openid"],
});
