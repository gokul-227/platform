import type { Http } from "./http";

/**
 * Metadata KV for an id-scoped parent, shared by org, project, thread and file.
 * `T` is the parent's response type — a write returns the updated entity.
 */
export class ScopedMetadataClient<T> {
  constructor(
    private readonly http: Http,
    private readonly base: string
  ) {}

  set = (id: string, keyPath: string, value: unknown): Promise<T> =>
    this.http.put<T>(
      `/${this.base}/${encodeURIComponent(id)}/metadata/${encodeURIComponent(keyPath)}`,
      { value }
    );

  delete = (id: string, keyPath: string): Promise<T> =>
    this.http.delete<T>(
      `/${this.base}/${encodeURIComponent(id)}/metadata/${encodeURIComponent(keyPath)}`
    );
}
