"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Task, Course, CalendarEvent } from "@prodapp/shared-types";
import { api } from "@/lib/api";
import { useAppKeys } from "@/lib/appKeys";
import { fuzzyScore } from "@/lib/fuzzy";
import { SearchIcon, TasksIcon, GraduationIcon, CalendarIcon, FocusIcon, PlusIcon, ChartIcon, HomeIcon } from "@/components/icons";

type Result =
  | { kind: "page"; title: string; sub: string; href: string; icon: React.ComponentType<{ className?: string }> }
  | { kind: "task"; title: string; sub: string; href: string }
  | { kind: "course"; title: string; sub: string; href: string }
  | { kind: "event"; title: string; sub: string; href: string }
  | { kind: "action"; title: string; sub: string; href: string; icon: React.ComponentType<{ className?: string }> };

const PAGES: Result[] = [
  { kind: "page", title: "Today", sub: "Dashboard", href: "/", icon: HomeIcon },
  { kind: "page", title: "Tasks", sub: "All tasks", href: "/tasks", icon: TasksIcon },
  { kind: "page", title: "Calendar", sub: "Schedule & events", href: "/calendar", icon: CalendarIcon },
  { kind: "page", title: "Courses", sub: "Manage courses", href: "/courses", icon: GraduationIcon },
  { kind: "page", title: "Timetable", sub: "Weekly classes", href: "/timetable", icon: CalendarIcon },
  { kind: "page", title: "Attendance", sub: "Track attendance", href: "/attendance", icon: ChartIcon },
  { kind: "page", title: "Analytics", sub: "Insights", href: "/analytics", icon: ChartIcon },
  { kind: "page", title: "Focus", sub: "Zen mode", href: "/zen", icon: FocusIcon },
  { kind: "page", title: "Settings", sub: "App preferences", href: "/settings", icon: FocusIcon },
];

const ACTIONS: Result[] = [
  { kind: "action", title: "New task", sub: "Create a task", href: "/tasks?new=1", icon: PlusIcon },
  { kind: "action", title: "Start focus", sub: "Enter Zen mode", href: "/zen", icon: FocusIcon },
  { kind: "action", title: "Back up & sync", sub: "Data & Sync settings", href: "/settings?tab=data-sync", icon: ChartIcon },
];

function matchable(r: Result): string {
  return r.kind === "event" ? `${r.title} ${r.sub}` : `${r.title} ${r.sub}`;
}

export function CommandPalette() {
  const { paletteOpen, setPaletteOpen } = useAppKeys();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loaded, setLoaded] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!paletteOpen) return;
    setQuery("");
    setIndex(0);
    setLoaded(false);
    const t = setTimeout(() => inputRef.current?.focus(), 10);
    return () => clearTimeout(t);
  }, [paletteOpen]);

  useEffect(() => {
    if (!paletteOpen || loaded) return;
    const now = new Date();
    const from = now.toISOString();
    const to = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000).toISOString();
    void Promise.all([
      api.get<Task[]>("/api/tasks"),
      api.get<Course[]>("/api/courses"),
      api.get<CalendarEvent[]>(`/api/calendar?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`),
    ])
      .then(([t, c, e]) => {
        if ("ok" in t && t.ok) setTasks(t.data);
        if ("ok" in c && c.ok) setCourses(c.data);
        if ("ok" in e && e.ok) setEvents(e.data.slice(0, 250));
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, [paletteOpen, loaded]);

  const results = useMemo<Result[]>(() => {
    if (!paletteOpen) return [];
    const all: Result[] = [];
    for (const p of PAGES) all.push({ ...p });
    for (const a of ACTIONS) all.push({ ...a });
    for (const t of tasks) {
      if (t.completed || t.deletedAt) continue;
      all.push({
        kind: "task",
        title: t.title,
        sub: t.dueDate ? `Due ${new Date(t.dueDate).toLocaleDateString(undefined, { month: "short", day: "numeric" })}` : "Task",
        href: "/tasks",
      });
    }
    for (const c of courses) all.push({ kind: "course", title: c.name, sub: c.code ? c.code : "Course", href: "/courses" });
    for (const e of events) {
      all.push({
        kind: "event",
        title: e.title,
        sub: new Date(e.startTime).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }),
        href: "/calendar",
      });
    }

    const q = query.trim();
    if (!q) {
      return all.slice(0, 10);
    }
    const scored = all
      .map((r) => ({ r, s: fuzzyScore(q, matchable(r)) }))
      .filter((x): x is { r: Result; s: number } => x.s !== null)
      .sort((a, b) => a.s - b.s)
      .slice(0, 12);
    return scored.map((x) => x.r);
  }, [paletteOpen, query, tasks, courses, events]);

  useEffect(() => {
    setIndex(0);
  }, [query, results.length]);

  useEffect(() => {
    const el = listRef.current?.children[index] as HTMLElement | undefined;
    el?.scrollIntoView({ block: "nearest" });
  }, [index]);

  useEffect(() => {
    if (!paletteOpen) return;
    const onKey = (e: KeyboardEvent) => {
      const list = listRef.current;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setIndex((i) => Math.min(i + 1, results.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        const r = results[index];
        if (r) {
          router.push(r.href);
          setPaletteOpen(false);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [paletteOpen, results, index, router, setPaletteOpen]);

  if (!paletteOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-backdrop px-4 pt-[12vh]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) setPaletteOpen(false);
      }}
    >
      <div className="w-full max-w-xl overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl">
        <div className="flex items-center gap-3 border-b border-border px-4">
          <SearchIcon className="h-4 w-4 shrink-0 text-text-muted" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search tasks, courses, events…"
            className="w-full bg-transparent py-3.5 text-sm text-text outline-none placeholder:text-text-muted"
          />
          <kbd className="rounded border border-border px-1.5 py-0.5 text-[10px] text-text-muted">esc</kbd>
        </div>

        <div ref={listRef} className="max-h-[45vh] overflow-y-auto p-2">
          {results.length === 0 ? (
            <p className="px-3 py-8 text-center text-sm text-text-muted">
              {loaded ? "No matches." : "Loading…"}
            </p>
          ) : (
            results.map((r, i) => (
              <button
                key={`${r.kind}-${r.title}-${i}`}
                type="button"
                onMouseEnter={() => setIndex(i)}
                onClick={() => {
                  router.push(r.href);
                  setPaletteOpen(false);
                }}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors ${
                  i === index ? "bg-surface-elevated" : ""
                }`}
              >
                {"icon" in r && r.icon ? <r.icon className="h-4 w-4 shrink-0 text-accent" /> : null}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-text">{r.title}</p>
                  <p className="truncate text-xs text-text-muted">{r.sub}</p>
                </div>
                <span className="shrink-0 text-[10px] font-medium uppercase tracking-wider text-text-muted">{r.kind}</span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}