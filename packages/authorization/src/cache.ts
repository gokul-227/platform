import { AsyncLocalStorage } from "node:async_hooks";

import type {
  CallHandler,
  ExecutionContext,
  NestInterceptor,
} from "@nestjs/common";
import { Injectable } from "@nestjs/common";
import type { Observable } from "rxjs";

/**
 * A per-request memo for authorization checks. One request asks the same
 * question many times, and without this that is an N+1 per row.
 *
 * Per request and no further: cross-request caching would make a revocation
 * take effect whenever an entry expired, turning a security question into a
 * timing one.
 *
 * `AsyncLocalStorage` rather than a request-scoped provider, which is viral and
 * would drag every service injecting the check surface into request scope.
 */

/** The promise, not the value, so concurrent identical checks share one call. */
type CacheStore = Map<string, Promise<unknown>>;

const storage = new AsyncLocalStorage<CacheStore>();

/** Memoize within the request, or just run when there is none: the graph sync
 * and thread run workers call these services outside any request. */
export function memoizePerRequest<T>(
  key: string,
  compute: () => Promise<T>
): Promise<T> {
  const store = storage.getStore();
  if (!store) {
    return compute();
  }
  const existing = store.get(key) as Promise<T> | undefined;
  if (existing) {
    return existing;
  }
  const pending = compute();
  store.set(key, pending);
  // A rejected check must not be remembered: the next attempt in the same
  // request should be able to reach a Keto that has come back.
  pending.catch(() => store.delete(key));
  return pending;
}

/** Runs a request inside its own memo. Registered globally by the module. */
@Injectable()
export class AuthorizationCacheInterceptor implements NestInterceptor {
  intercept(
    _context: ExecutionContext,
    next: CallHandler
  ): Observable<unknown> {
    return storage.run(new Map(), () => next.handle());
  }
}

/** Runs `work` inside a fresh memo. For a worker, which has no request. */
export function withAuthorizationCache<T>(work: () => Promise<T>): Promise<T> {
  return storage.run(new Map(), work);
}
