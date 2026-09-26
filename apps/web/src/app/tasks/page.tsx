"use client";

import { useEffect, useRef, useState } from "react";
import { animate, stagger } from "animejs";
import { AppShell } from "@/components/AppShell";
import { useTasks, type TaskFilter } from "@/lib/useTasks";
import { TaskCard } from "@/components/TaskCard";
import { TaskInput } from "@/components/TaskInput";
import { Reveal } from "@/components/Reveal";

const FILTERS: { key: TaskFilter; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "overdue", label: "Overdue" },
  { key: "all", label: "All" },
];

export default function TasksPage() {
  const { tasks, loading, filter, setFilter, addTask, completeTask, deleteTask } =
    useTasks();
  const listRef = useRef<HTMLDivElement>(null);
  const [autoFocus, setAutoFocus] = useState(false);

  // "N" shortcut / palette navigate to ?new=1 — pick it up client-side.
  useEffect(() => {
    if (typeof window === "undefined") return;
    setAutoFocus(new URLSearchParams(window.location.search).get("new") === "1");
  }, []);

  // Staggered entrance on filter change / first load.
  useEffect(() => {
    if (loading || tasks.length === 0 || !listRef.current) return;
    const els = listRef.current.querySelectorAll<HTMLElement>("[data-task-card]");
    if (els.length === 0) return;
    const anim = animate(Array.from(els), {
      opacity: [0, 1],
      translateY: [16, 0],
      delay: stagger(50),
      duration: 400,
      ease: "outCubic",
    });
    return () => {
      anim.pause();
    };
  }, [loading, tasks.length, filter]);

  return (
    <AppShell>
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Tasks</h1>
          <p className="mt-1 text-sm text-text-muted">
            {loading
              ? "Loading…"
              : `${tasks.length} ${filter === "all" ? "tasks" : filter === "overdue" ? "overdue" : "due today"}`}
          </p>
        </div>
        <div className="flex gap-1 rounded-lg border border-border bg-surface p-1">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                filter === f.key
                  ? "bg-surface-elevated text-text"
                  : "text-text-muted hover:text-text"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </header>

      <Reveal delay={0}>
        <div className="mb-6">
          <TaskInput onAdd={addTask} autoFocus={autoFocus} />
        </div>
      </Reveal>

      <div ref={listRef} className="space-y-2">
        {tasks.map((task) => (
          <div key={task.id} data-task-card>
            <TaskCard
              task={task}
              onComplete={(t) => completeTask(t, t.isRecurring ? todayStr() : undefined)}
              onDelete={deleteTask}
            />
          </div>
        ))}

        {!loading && tasks.length === 0 && (
          <div className="rounded-2xl border border-dashed border-border px-6 py-14 text-center">
            <p className="text-[15px] font-medium text-text">
              {filter === "overdue"
                ? "Nothing is late."
                : filter === "today"
                  ? "Today is clear."
                  : "No tasks yet."}
            </p>
            <p className="mx-auto mt-1.5 max-w-sm text-[12.5px] leading-relaxed text-text-muted">
              {filter === "overdue"
                ? "Everything with a deadline still has time. This is the good kind of screen to look at."
                : filter === "today"
                  ? "Nothing is due or reserved for today. Give a task an effort and reserve it for today, and Today will tell you whether it actually fits."
                  : "Add the first one above. An effort estimate is what lets the app tell you whether the day can hold it."}
            </p>
          </div>
        )}
      </div>
    </AppShell>
  );
}

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}