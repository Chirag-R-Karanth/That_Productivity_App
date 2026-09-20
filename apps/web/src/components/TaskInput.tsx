"use client";

import { useEffect, useState } from "react";
import type { Course, CreateTaskRequest, TaskPriority } from "@prodapp/shared-types";
import { api } from "@/lib/api";
import { animate } from "animejs";

type RecurrencePreset = "none" | "daily" | "weekdays" | "weekly" | "biweekly" | "monthly";

interface TaskInputProps {
  onAdd: (input: CreateTaskRequest) => void;
}

const RECURRENCE_LABELS: Record<RecurrencePreset, string> = {
  none: "No repetition",
  daily: "Every day",
  weekdays: "Every weekday",
  weekly: "Weekly",
  biweekly: "Every 2 weeks",
  monthly: "Monthly",
};

const DAY_CODES = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];

function weekdayOf(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return DAY_CODES[new Date(y, m - 1, d).getDay()];
}

export function TaskInput({ onAdd }: TaskInputProps) {
  const [courses, setCourses] = useState<Course[]>([]);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [dueTime, setDueTime] = useState("12:00");
  const [priority, setPriority] = useState<TaskPriority>("MEDIUM");
  const [courseId, setCourseId] = useState("");
  const [recurrence, setRecurrence] = useState<RecurrencePreset>("none");
  const [formRef, setFormRef] = useState<HTMLDivElement | null>(null);

  useEffect(() => {
    void api
      .get<Course[]>("/api/courses")
      .then((res) => {
        if ("ok" in res && res.ok) setCourses(res.data);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (open && formRef) {
      const anim = animate(formRef, {
        height: [0, "auto"],
        opacity: [0, 1],
        duration: 250,
        ease: "outCubic",
      });
      return () => {
        anim.pause();
      };
    }
  }, [open, formRef]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    const todayStr = new Date().toISOString().slice(0, 10);
    const date = dueDate || todayStr;

    let recurrenceRule: string | null = null;
    const day = weekdayOf(date);
    switch (recurrence) {
      case "daily": recurrenceRule = "FREQ=DAILY"; break;
      case "weekdays": recurrenceRule = "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR"; break;
      case "weekly": recurrenceRule = `FREQ=WEEKLY;BYDAY=${day}`; break;
      case "biweekly": recurrenceRule = `FREQ=WEEKLY;INTERVAL=2;BYDAY=${day}`; break;
      case "monthly": recurrenceRule = "FREQ=MONTHLY"; break;
      default: recurrenceRule = null;
    }

    onAdd({
      title: title.trim(),
      notes: notes.trim() || null,
      dueDate: dueDate || null,
      dueTime: dueTime || null,
      priority,
      courseId: courseId || null,
      recurrenceRule,
    });

    setTitle("");
    setNotes("");
    setOpen(false);
  };

  return (
    <div className="rounded-2xl border border-border bg-surface">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 px-5 py-4 text-left text-sm"
      >
        <span className="flex h-5 w-5 items-center justify-center rounded-md border border-border text-text-muted">
          +
        </span>
        <span className="text-text-muted">Add a task</span>
      </button>

      {open && (
        <div ref={setFormRef} className="overflow-hidden">
          <form onSubmit={submit} className="space-y-3 border-t border-border px-5 py-4">
            <input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="What needs doing?"
              className="w-full rounded-lg border border-border bg-surface-elevated px-4 py-3 text-sm text-text placeholder-text-muted outline-none focus:border-accent"
            />
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Notes (optional)"
              rows={2}
              className="w-full resize-none rounded-lg border border-border bg-surface-elevated px-4 py-3 text-sm text-text placeholder-text-muted outline-none focus:border-accent"
            />

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <label className="text-xs text-text-muted">
                Due date
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-border bg-surface-elevated px-3 py-2 text-sm text-text outline-none focus:border-accent"
                />
              </label>
              <label className="text-xs text-text-muted">
                Time
                <input
                  type="time"
                  value={dueTime}
                  onChange={(e) => setDueTime(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-border bg-surface-elevated px-3 py-2 text-sm text-text outline-none focus:border-accent"
                />
              </label>
              <label className="text-xs text-text-muted">
                Priority
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value as TaskPriority)}
                  className="mt-1 w-full rounded-lg border border-border bg-surface-elevated px-3 py-2 text-sm text-text outline-none focus:border-accent"
                >
                  <option value="LOW">Low</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="HIGH">High</option>
                </select>
              </label>
              <label className="text-xs text-text-muted">
                Repetition
                <select
                  value={recurrence}
                  onChange={(e) => setRecurrence(e.target.value as RecurrencePreset)}
                  className="mt-1 w-full rounded-lg border border-border bg-surface-elevated px-3 py-2 text-sm text-text outline-none focus:border-accent"
                >
                  {(Object.keys(RECURRENCE_LABELS) as RecurrencePreset[]).map((k) => (
                    <option key={k} value={k}>
                      {RECURRENCE_LABELS[k]}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {courses.length > 0 && (
              <label className="block text-xs text-text-muted">
                Course
                <select
                  value={courseId}
                  onChange={(e) => setCourseId(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-border bg-surface-elevated px-3 py-2 text-sm text-text outline-none focus:border-accent"
                >
                  <option value="">No course</option>
                  {courses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                      {c.code ? ` (${c.code})` : ""}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg px-4 py-2 text-sm text-text-muted transition-colors hover:bg-surface-elevated"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover"
              >
                Add task
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}