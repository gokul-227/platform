/**
 * Feature flags, as a seam rather than a client.
 *
 * Flags are authored in the flag service (PostHog today) and only ever read
 * here. This package deliberately does not depend on that service: a product
 * team gets the hook from the SDK they already have, and the one app that owns
 * the vendor client passes it in once. Nobody else installs, versions or
 * configures it, and swapping services is one adapter rather than a sweep.
 *
 * `FlagAdapter` is duck-typed on purpose. A PostHog browser client already
 * satisfies it, so the adapter is a two-line wrapper and no import of theirs
 * reaches this file.
 */

export interface FlagAdapter {
  /**
   * The flag's payload, for a multivariate flag or a config value. Undefined
   * when the service has none, which callers treat as their own default.
   */
  getPayload?(key: string): unknown;
  /** Whether the flag is on for whoever is currently identified. */
  isEnabled(key: string): boolean;
}

/**
 * The default: everything off.
 *
 * A missing provider must not make a half-built feature appear. It also means a
 * consumer with no flag service configured — a test, a local run, an app that
 * has not wired one — behaves like production with every flag off, rather than
 * throwing.
 */
export const flagsOff: FlagAdapter = Object.freeze({
  isEnabled: () => false,
  getPayload: () => undefined,
});

/** Every flag on, for a test or a local run that wants the unreleased path. */
export const flagsOn: FlagAdapter = Object.freeze({
  isEnabled: () => true,
  getPayload: () => undefined,
});

/** A fixed set, for a test asserting behaviour on both sides of one flag. */
export function staticFlags(
  enabled: Readonly<Record<string, boolean>>
): FlagAdapter {
  return { isEnabled: (key) => enabled[key] === true };
}

/**
 * Wrap a PostHog browser client.
 *
 * Structurally typed against what is actually called, so this file compiles
 * with no PostHog types present and the app keeps sole ownership of the
 * dependency. `isFeatureEnabled` answers undefined until the flags have loaded,
 * which is read as off: a flag that flickers on after first paint is worse than
 * one that arrives a beat late.
 */
export function postHogFlags(client: {
  isFeatureEnabled(key: string): boolean | undefined;
  getFeatureFlagPayload?(key: string): unknown;
}): FlagAdapter {
  return {
    isEnabled: (key) => client.isFeatureEnabled(key) === true,
    getPayload: (key) => client.getFeatureFlagPayload?.(key),
  };
}
