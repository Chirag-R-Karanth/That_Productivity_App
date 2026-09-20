"use client";

import { useRef } from "react";
import { animate } from "animejs";
import type { Task } from "@prodapp/shared-types";

interface TaskCardProps {
  task: Task;
  onComplete: (task: Task, occurrenceDate?: string) => void;
  onDelete: (task: Task) => void;
  onExit?: (el: HTMLElement) => void;
}

const PRIORITY_STYLES: Record<Task["priority"], string> = {
  LOW: "bg-[#1d2531] text-text-muted",
  MEDIUM: "bg-[#2a2438] text-[#b3a6ff]",
  HIGH: "bg-[#3a1e24] text-[#f0a6a6]",
};

export function TaskCard({ task, onComplete, onDelete, onExit }: TaskCardProps) {
  const ref = useRef<HTMLDivElement>(null);

  const triggerExit = (action: () => void) => {
    const el = ref.current;
    if (!el) return action();
    const anim = animate(el, {
      opacity: 0,
      translateX: 40,
      height: 0,
      marginBottom: 0,
      paddingTop: 0,
      paddingBottom: 0,
      duration: 300,
      ease: "inOutQuad",
      onComplete: () => {
        onExit?.(el);
        action();
      },
    });
    void anim;
  };

  const handleToggle = () => {
    if (!task.completed) {
      triggerExit(() => onComplete(task, undefined));
    } else {
      onComplete(task, undefined);
    }
  };

  return (
    <div
      ref={ref}
      className={`group flex items-start gap-3 rounded-xl border border-border bg-surface p-4 transition-colors hover:border-[#333a48] ${
        task.completed ? "opacity-60" : ""
      }`}
    >
      <button
        onClick={handleToggle}
        aria-label={task.completed ? "Mark not done" : "Mark done"}
        className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors"
        style={{
          borderColor: task.completed ? "var(--color-success)" : "var(--color-border)",
          background: task.completed ? "var(--color-success)" : "transparent",
        }}
      >
        {task.completed && (
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M2 6.5L4.5 9L10 3" stroke="#0b0d12" strokeWidth="2" strokeLinecap="round" />
          </svg>
        )}
      </button>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className={`truncate text-sm font-medium ${task.completed ? "line-through" : ""}`}>
            {task.title}
          </p>
          {task.isRecurring && (
            <span className="shrink-0 text-[11px] text-text-muted">↻</span>
          )}
        </div>

        {task.notes && task.notes.trim() && (
          <p className="mt-0.5 line-clamp-1 text-xs text-text-muted">{task.notes}</p>
        )}

        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${PRIORITY_STYLES[task.priority]}`}>
            {task.priority.toLowerCase()}
          </span>
          {task.courseName && (
            <span className="rounded bg-[#1a2440] px-1.5 py-0.5 text-[10px] text-[#8fb0ff]">
              {task.courseName}
            </span>
          )}
          {task.displayDate && (
            <span
              className={`rounded px-1.5 py-0.5 text-[10px] tabular-nums ${
                task.displayDate < todayStr() && !task.completed
                  ? "bg-[#3a1e24] text-[#f0a6a6]"
                  : "bg-surface-elevated text-text-muted"
              }`}
            >
              {task.dueTime ? `${task.displayDate} ${task.dueTime}` : task.displayDate}
            </span>
          )}
        </div>
      </div>

      <button
        onClick={() => triggerExit(() => onDelete(task))}
        aria-label="Delete task"
        className="shrink-0 rounded p-1 text-text-muted opacity-0 transition-opacity hover:bg-surface-elevated hover:text-danger focus:opacity-100 group-hover:opacity-100"
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}