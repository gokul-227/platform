"use client";

import type {
  ThreadEntityRef,
  ThreadMessageResponse,
  ThreadRunStep,
  ThreadRunUsage,
  ThreadScope,
} from "@aec-craft/platform-contracts";
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

import type { Session } from "../session";

import { useAgentClient } from "./agent.provider";

/** A user or assistant turn in the conversation. */
export interface ChatTurn {
  content: string;
  /** Opaque app data on an assistant answer (e.g. a scene overlay). */
  metadata?: Record<string, unknown>;
  /** Entity references attached to an assistant answer (graph nodes, files). */
  references?: ThreadEntityRef[];
  role: "user" | "assistant";
}

/** One generation's debug trace, accumulated across the conversation (local only). */
export interface DebugTurn {
  question: string;
  steps: ThreadRunStep[];
  usage: ThreadRunUsage | null;
}

export interface ChatState {
  // ── Panel ──
  /** Whether the chat panel (thread view) is open. Auto-opens on long answers. */
  chatOpen: boolean;

  // ── Debug (local only) ──
  /** Per-turn query/token trace; populated only when the deployment enables debug. */
  debugTurns: DebugTurn[];
  /** The agent asked a question and is waiting; the next message resumes it. */
  isAwaitingReply: boolean;
  /** A reply is being generated. */
  isPending: boolean;
  // ── Scope ──
  /** A scope is set, so the agent can be queried. */
  isReady: boolean;
  /** Most recent assistant turn, for an inline glance. */
  lastAnswer: ChatTurn | undefined;
  /** The latest answer exceeds `longAnswerChars` — open the panel to read it. */
  lastAnswerIsLong: boolean;
  /** Drop the conversation and start an unsaved new thread. */
  newThread: () => void;
  /** Load a past thread's messages into the conversation and reveal the panel. */
  selectThread: (threadId: string) => void;

  // ── Actions ──
  send: (content: string) => void;
  setChatOpen: (open: boolean) => void;

  // ── Conversation ──
  /** The thread being viewed, or undefined for an unsaved new thread. */
  threadId: string | undefined;
  turns: ChatTurn[];
}

const ChatContext = createContext<ChatState | null>(null);

export interface ChatProviderProps {
  children: ReactNode;
  /** Answers longer than this (characters) auto-open the chat panel. Default 140. */
  longAnswerChars?: number;
  /** Current scope; `null` disables sending. Changing it starts a fresh conversation. */
  scope: ThreadScope | null;
}

/**
 * Holds one conversation's state and drives the agent through a `session` from
 * the agent surface of `@aec-craft/platform-sdk` — create-thread → message → run → stream →
 * reply, plus HITL resume. Bring your own UI and read everything via `useChat()`.
 * The `AgentClient` comes from the enclosing `<AgentProvider>`; pass only the scope.
 */
export function ChatProvider({
  scope,
  longAnswerChars = 140,
  children,
}: ChatProviderProps): ReactNode {
  const client = useAgentClient();
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [isPending, setIsPending] = useState(false);
  const [threadId, setThreadId] = useState<string | undefined>(undefined);
  const [chatOpen, setChatOpen] = useState(false);
  const [awaiting, setAwaiting] = useState(false);
  const [debugTurns, setDebugTurns] = useState<DebugTurn[]>([]);

  // One live session per thread; a new/selected thread (or a scope change)
  // replaces it. Created lazily so it always picks up the current scope.
  const sessionRef = useRef<Session | null>(null);
  function ensureSession(): Session {
    sessionRef.current ??= client.session(scope ? { scope } : {});
    return sessionRef.current;
  }

  // Reset the conversation when the scope changes (a different project/org).
  const scopeKey = scope
    ? `${scope.type}:${scope.type === "project" ? scope.projectId : scope.orgId}`
    : "";
  const prevScopeKey = useRef(scopeKey);
  useEffect(() => {
    if (prevScopeKey.current === scopeKey) {
      return;
    }
    prevScopeKey.current = scopeKey;
    sessionRef.current = null;
    setTurns([]);
    setThreadId(undefined);
    setAwaiting(false);
    setDebugTurns([]);
    setChatOpen(false);
  }, [scopeKey]);

  async function send(raw: string): Promise<void> {
    const content = raw.trim();
    if (!content || isPending || !scope) {
      return;
    }
    setTurns((t) => [...t, { role: "user", content }]);
    setIsPending(true);
    try {
      // The session creates the thread on the first turn and resumes a parked
      // question on later ones — it tracks which.
      const reply = await ensureSession().send(content);
      setThreadId(reply.threadId);
      setTurns((t) => [
        ...t,
        {
          role: "assistant",
          content: reply.answer,
          references: reply.references,
          ...(reply.metadata ? { metadata: reply.metadata } : {}),
        },
      ]);
      setAwaiting(reply.requiresAction);
      if (reply.debug) {
        const { steps } = reply.debug;
        setDebugTurns((d) => [
          ...d,
          { question: content, usage: reply.usage, steps },
        ]);
      }
      if (reply.answer.length > longAnswerChars) {
        setChatOpen(true);
      }
    } catch (err) {
      console.error("[chat] send failed", err);
      setTurns((t) => [
        ...t,
        {
          role: "assistant",
          content: "Something went wrong. Please try again.",
        },
      ]);
    } finally {
      setIsPending(false);
    }
  }

  async function selectThread(id: string): Promise<void> {
    sessionRef.current = client.session({
      ...(scope ? { scope } : {}),
      threadId: id,
    });
    const res = await client.threads.messages.list(id);
    const loaded: ChatTurn[] = res.items
      .filter(
        (m): m is ThreadMessageResponse & { role: "user" | "assistant" } =>
          m.role === "user" || m.role === "assistant"
      )
      .map((m) => ({
        role: m.role,
        content: m.content,
        ...(m.references ? { references: m.references } : {}),
        ...(m.metadata && Object.keys(m.metadata).length > 0
          ? { metadata: m.metadata }
          : {}),
      }));
    setThreadId(id);
    setTurns(loaded);
    setAwaiting(false);
    setDebugTurns([]);
    setChatOpen(true);
  }

  function newThread(): void {
    sessionRef.current = scope ? client.session({ scope }) : null;
    setThreadId(undefined);
    setTurns([]);
    setAwaiting(false);
    setDebugTurns([]);
  }

  const lastAnswer = [...turns].reverse().find((t) => t.role === "assistant");
  const lastAnswerIsLong =
    lastAnswer !== undefined && lastAnswer.content.length > longAnswerChars;

  return (
    <ChatContext.Provider
      value={{
        isReady: scope !== null,
        threadId,
        turns,
        lastAnswer,
        lastAnswerIsLong,
        isPending,
        isAwaitingReply: awaiting,
        send: (content) => void send(content),
        selectThread: (id) => void selectThread(id),
        newThread,
        chatOpen,
        setChatOpen,
        debugTurns,
      }}
    >
      {children}
    </ChatContext.Provider>
  );
}

export function useChat(): ChatState {
  const ctx = useContext(ChatContext);
  if (!ctx) {
    throw new Error("useChat must be used within a ChatProvider");
  }
  return ctx;
}
