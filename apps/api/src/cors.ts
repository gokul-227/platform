import type { CorsOptions } from "@nestjs/common/interfaces/external/cors-options.interface";

/**
 * Request headers a browser client may send. Pinned rather than reflected: with
 * an open origin, the default behaviour echoes whatever the preflight asks for,
 * which makes any future header-trusting shortcut (`X-User-Id`, an internal
 * service token, a debug switch) reachable from any page instead of unreachable
 * from a browser. Nothing here trusts a header other than `Authorization`
 * today, and this is what keeps that from becoming a remote hole rather than a
 * local mistake. A browser client that needs another header adds it here, and
 * sees a refused preflight until it does.
 *
 * `Content-Type` is not CORS-safelisted for `application/json`.
 * `MCP-Protocol-Version` rides on every post-initialize MCP request.
 */
const ALLOWED_HEADERS = [
  "Authorization",
  "Content-Type",
  "MCP-Protocol-Version",
];

/**
 * `WWW-Authenticate` carries the RFC 9728 challenge that tells an MCP client
 * where to authenticate. It is not a safelisted response header, so a browser
 * client cannot read the 401 that discovery depends on unless it is exposed.
 */
const EXPOSED_HEADERS = ["WWW-Authenticate"];

/**
 * Cross-origin policy for browser callers, or `null` to leave CORS alone.
 *
 * `CORS_ORIGINS` unset means off, not "reflect anything": if something in front
 * of this API sets the headers itself, a second `Access-Control-Allow-Origin`
 * makes the response malformed and the browser drops it after a 200, so the
 * caller sees only "failed to fetch".
 *
 * `*` is the deployed setting. This API authenticates by `Authorization` header
 * only, so a hostile page cannot make a browser attach a credential, and an
 * open policy grants it no more than it already has from any server. Two things
 * hold that up, and both have to stay true: no cookie or session auth, and no
 * route that trusts a request header for identity.
 */
export function corsOptions(): CorsOptions | null {
  const raw = process.env.CORS_ORIGINS;
  if (!raw) {
    return null;
  }
  const origins = raw
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  if (origins.length === 0) {
    return null;
  }
  const isOpen = origins.includes("*");
  if (isOpen && origins.length > 1) {
    // Reads as an allowlist, behaves as open. Refusing to boot beats picking
    // the wider of the two meanings.
    throw new Error(
      `CORS_ORIGINS mixes "*" with named origins (${raw}); use one or the other`
    );
  }
  // `credentials` stays off in both shapes: browsers reject a credentialed
  // response carrying `*`, and nothing here reads cookies.
  return {
    origin: isOpen ? "*" : origins,
    allowedHeaders: ALLOWED_HEADERS,
    exposedHeaders: EXPOSED_HEADERS,
  };
}
