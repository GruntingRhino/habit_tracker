"use client";

import { useCallback, useEffect, useState } from "react";
import type {
  CoachAction,
  CoachChatMessage,
  CoachChatPayload,
  CoachGoalSummary,
} from "@/lib/coach-types";

interface UseCoachChatResult {
  messages: CoachChatMessage[];
  goals: CoachGoalSummary[];
  loading: boolean;
  ready: boolean;
  error: string | null;
  sendMessage: (message: string) => Promise<void>;
  applyAction: (action: CoachAction) => Promise<void>;
  pendingActionIds: Set<string>;
}

async function fetchCoachState(): Promise<CoachChatPayload> {
  const res = await fetch("/api/chat/daily", {
    credentials: "include",
  });

  if (!res.ok) {
    throw new Error("Failed to load coach history");
  }

  return res.json() as Promise<CoachChatPayload>;
}

export function useCoachChat(): UseCoachChatResult {
  const [messages, setMessages] = useState<CoachChatMessage[]>([]);
  const [goals, setGoals] = useState<CoachGoalSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingActionIds, setPendingActionIds] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const payload = await fetchCoachState();
      setMessages(payload.messages);
      setGoals(payload.goals);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Failed to load coach");
    } finally {
      setLoading(false);
      setReady(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const sendMessage = useCallback(async (message: string) => {
    const content = message.trim();
    if (!content) return;

    const optimisticMessage: CoachChatMessage = {
      id: `optimistic-${Date.now()}`,
      role: "user",
      content,
      createdAt: new Date().toISOString(),
      actions: [],
    };

    setMessages((current) => [...current, optimisticMessage]);
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/chat/daily", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ message: content }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error ?? "Failed to send message");
      }

      const data = await res.json() as { message: CoachChatMessage; goals: CoachGoalSummary[] };
      setMessages((current) => {
        const withoutOptimistic = current.filter((item) => item.id !== optimisticMessage.id);
        return [...withoutOptimistic, optimisticMessage, data.message];
      });
      setGoals(data.goals);
    } catch (nextError) {
      setMessages((current) => current.filter((item) => item.id !== optimisticMessage.id));
      setError(nextError instanceof Error ? nextError.message : "Failed to send message");
    } finally {
      setLoading(false);
    }
  }, []);

  const applyAction = useCallback(async (action: CoachAction) => {
    if (action.applied || pendingActionIds.has(action.id)) return;

    setPendingActionIds((current) => new Set(current).add(action.id));
    setError(null);

    try {
      if (action.type === "add_habit") {
        const res = await fetch("/api/habits", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(action.habit),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error((data as { error?: string }).error ?? "Failed to create habit");
        }
      } else {
        const res = await fetch("/api/projects", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(action.project),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error((data as { error?: string }).error ?? "Failed to create project");
        }

        const project = await res.json() as { id: string };

        if (action.project.generateTasks) {
          await fetch(`/api/projects/${project.id}/generate`, {
            method: "POST",
            credentials: "include",
          });
        }
      }

      const payload = await fetchCoachState();
      setMessages(payload.messages);
      setGoals(payload.goals);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Failed to apply action");
    } finally {
      setPendingActionIds((current) => {
        const next = new Set(current);
        next.delete(action.id);
        return next;
      });
    }
  }, [pendingActionIds]);

  return {
    messages,
    goals,
    loading,
    ready,
    error,
    sendMessage,
    applyAction,
    pendingActionIds,
  };
}
