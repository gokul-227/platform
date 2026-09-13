import type {
  CreateThreadMessageInput,
  ThreadMessageListInput,
  ThreadMessageListResponse,
  ThreadMessageResponse,
} from "@aec-craft/platform-contracts";

import type { Http } from "../common/http";
import { qs } from "../common/qs";

/** Immutable message log under a thread. Append + list only. */
export class ThreadMessageClient {
  constructor(private readonly http: Http) {}

  list = (
    threadId: string,
    query?: ThreadMessageListInput
  ): Promise<ThreadMessageListResponse> =>
    this.http.get<ThreadMessageListResponse>(
      `/threads/${encodeURIComponent(threadId)}/messages${qs(query)}`
    );

  create = (
    threadId: string,
    input: CreateThreadMessageInput
  ): Promise<ThreadMessageResponse> =>
    this.http.post<ThreadMessageResponse>(
      `/threads/${encodeURIComponent(threadId)}/messages`,
      input
    );
}
