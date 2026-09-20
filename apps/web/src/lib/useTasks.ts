"use client";

import { useCallback, useEffect, useState } from "react";
import type { Task, CreateTaskRequest } from "@prodapp/shared-types";
import { api } from "@/lib/api";

export type TaskFilter = "all" | "today" | "overdue";

const TASKS_ENDPOINT = "/api/tasks";

function buildQuery(filter: TaskFilter): string {
  return filter === "all" ? "?filter=all" : filter === "today" ? "?filter=today" : "?filter=overdue";
}

export function useTasks() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<TaskFilter>("today");
  const [refetchKey, setRefetchKey] = useState(0);

  const refetch = useCallback(() => setRefetchKey((k) => k + 1), []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const run = async () => {
      try {
        const res = await api.get<Task[]>(`${TASKS_ENDPOINT}${buildQuery(filter)}`);
        if (cancelled) return;
        if ("ok" in res && res.ok) setTasks(res.data);
      } catch {
        setTasks([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [filter, refetchKey]);

  // Re-fetch after the service worker replays the offline queue.
  useEffect(() => {
    const refetchOnOnline = () => void refetch();
    window.addEventListener("sync-refresh", refetchOnOnline);
    window.addEventListener("online", refetchOnOnline);
    return () => {
      window.removeEventListener("sync-refresh", refetchOnOnline);
      window.removeEventListener("online", refetchOnOnline);
    };
  }, [refetch]);

  const addTask = useCallback(
    async (input: CreateTaskRequest) => {
      // Optimistically append for the entrance animation.
      const optimistic: Task = {
        id: crypto.randomUUID(),
        userId: "",
        title: input.title,
        notes: input.notes ?? null,
        dueDate: input.dueDate ?? null,
        dueTime: input.dueTime ?? null,
        completed: false,
        completedAt: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        courseId: input.courseId ?? null,
        courseName: null,
        recurrenceRule: input.recurrenceRule ?? null,
        priority: input.priority ?? "MEDIUM",
        deletedAt: null,
        isRecurring: !!input.recurrenceRule,
        displayDate: input.dueDate ?? null,
        nextOccurrence: input.recurrenceRule ? (input.dueDate ?? null) : null,
      };
      setTasks((prev) => [optimistic, ...prev]);
      const res = await api.post<Task>(TASKS_ENDPOINT, { ...input, id: optimistic.id });
      if ("ok" in res && res.ok && !("queued" in (res.data as object))) {
        setTasks((prev) => prev.map((t) => (t.id === optimistic.id ? res.data : t)));
      }
      void refetch();
    },
    [refetch],
  );

  const completeTask = useCallback(
    async (task: Task, occurrenceDate?: string) => {
      const next = !task.completed;
      setTasks((prev) =>
        prev.map((t) =>
          t.id === task.id
            ? { ...t, completed: next, completedAt: next ? new Date().toISOString() : null }
            : t,
        ),
      );
      const res = await api.post<Task>(`${TASKS_ENDPOINT}/${task.id}/complete`, {
        completed: next,
        occurrenceDate,
      });
      if ("ok" in res && res.ok && !("queued" in (res.data as object))) {
        setTasks((prev) => prev.map((t) => (t.id === task.id ? res.data : t)));
      }
      void refetch();
    },
    [refetch],
  );

  const deleteTask = useCallback(
    async (task: Task) => {
      setTasks((prev) => prev.filter((t) => t.id !== task.id));
      await api.delete(`${TASKS_ENDPOINT}/${task.id}`);
      void refetch();
    },
    [refetch],
  );

  return { tasks, loading, filter, setFilter, addTask, completeTask, deleteTask };
}