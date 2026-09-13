import { InternalErrors, PlatformError } from "@aec-craft/platform-contracts";
/**
 * Vertex AI auth: keyless ADC by default (the Cloud Run service identity, or an
 * impersonated local login), inline service-account credentials only for hosts
 * outside GCP. Shared by the embedder and the answerer so one identity covers
 * both.
 */

export interface VertexCredentials {
  client_email: string;
  private_key: string;
  project_id?: string | undefined;
}

export interface VertexAuthOptions {
  credentials?: VertexCredentials;
  /** Test seam: a bearer-token supplier replacing google-auth-library. */
  getAccessToken?: () => Promise<string>;
  projectId?: string;
}

export type VertexAuth = () => Promise<{ project: string; token: string }>;

/**
 * The credential shape google-auth-library accepts, which declares `project_id`
 * as present-or-absent rather than nullable. Dropping the key is not the same as
 * passing undefined under `exactOptionalPropertyTypes`.
 */
function jwtInput(credentials: VertexCredentials): {
  client_email: string;
  private_key: string;
  project_id?: string;
} {
  return {
    client_email: credentials.client_email,
    private_key: credentials.private_key,
    ...(credentials.project_id === undefined
      ? {}
      : { project_id: credentials.project_id }),
  };
}

export function createVertexAuth(options: VertexAuthOptions): VertexAuth {
  let cachedProject = options.projectId ?? options.credentials?.project_id;
  let tokenFor = options.getAccessToken;

  return async () => {
    if (!tokenFor) {
      const { GoogleAuth } = await import("google-auth-library");
      const auth = new GoogleAuth({
        scopes: ["https://www.googleapis.com/auth/cloud-platform"],
        ...(options.credentials
          ? { credentials: jwtInput(options.credentials) }
          : {}),
      });
      cachedProject ??= await auth.getProjectId();
      const client = await auth.getClient();
      tokenFor = async () => {
        const issued = await client.getAccessToken();
        const value = typeof issued === "string" ? issued : issued?.token;
        if (!value) {
          throw new PlatformError(
            InternalErrors.UNEXPECTED,
            "Vertex auth returned no access token"
          );
        }
        return value;
      };
    }
    if (!cachedProject) {
      throw new PlatformError(
        InternalErrors.UNEXPECTED,
        "Vertex auth has no project id and none could be discovered"
      );
    }
    return { token: await tokenFor(), project: cachedProject };
  };
}
