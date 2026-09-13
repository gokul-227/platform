/**
 * Configuration this API refuses to guess at.
 *
 * The identity variables are all optional in the packages that read them, and
 * every default is a plausible-looking localhost value. That combination fails
 * in the worst available way: the service boots, its health check passes, and
 * it answers 401 to every gated route, or serves a docs portal that sends the
 * reader's browser to whatever is listening on port 4444 on their own machine.
 * Nothing surfaces the misconfiguration, so it reads as a bug in the caller.
 *
 * Requiring them moves that failure to boot, where a deploy shows it.
 */
export function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

const TRAILING_SLASHES = /\/+$/;

/**
 * An OpenID issuer publishes its keys at the standard discovery path, so the
 * JWKS location is derived rather than configured: two values that must agree
 * are two values that can disagree.
 */
export function jwksUrlFor(issuer: string): string {
  return `${issuer.replace(TRAILING_SLASHES, "")}/.well-known/jwks.json`;
}
