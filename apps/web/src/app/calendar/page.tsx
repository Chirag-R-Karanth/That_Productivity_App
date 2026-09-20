"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import type { CalendarEvent, CreateCalendarEventRequest, Course, Task } from "@prodapp/shared-types";
import { api } from "@/lib/api";
import { AppShell } from "@/components/AppShell";
import { Reveal } from "@/components/Reveal";
import { courseColor } from "@/lib/timetable";

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const EVENT_COLORS = ["#8fb0ff", "#5ce09e", "#f0a6a6", "#b3a6ff", "#ffd08f", "#82d8e6"];
const TASK_COLOR = "#9be08f";

type Filter = "all" | "event" | "task" | "class";

interface CalItem {
  key: string;
  kind: "event" | "task" | "class";
  title: string;
  date: string;
  startTime: string | null; // "HH:MM" or null for all-day
  endTime: string | null;
  color: string;
  completed?: boolean;
  event?: CalendarEvent;
  task?: Task;
  taskDate?: string;
  course?: Course;
}

function monthMatrix(year: number, month: number): (Date | null)[][] {
  const first = new Date(year, month, 1);
  const startDow = first.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (Date | null)[][] = [];
  let week: (Date | null)[] = [];
  for (let i = 0; i < startDow; i++) week.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    week.push(new Date(year, month, d));
    if (week.length === 7) {
      cells.push(week);
      week = [];
    }
  }
  if (week.length) {
    while (week.length < 7) week.push(null);
    cells.push(week);
  }
  return cells;
}

function eventColor(e: CalendarEvent): string {
  return e.color ?? "#8fb0ff";
}

/** Local-timezone YYYY-MM-DD key for an ISO timestamp. */
function localDayKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Local "HH:MM" for an ISO timestamp. */
function localTime(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function ymd(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function addDays(date: Date, n: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

interface TaskOccurrencesResponse {
  taskId: string;
  title: string;
  occurrences: { date: string; completed: boolean }[];
}

export default function CalendarPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [recurringOccurrences, setRecurringOccurrences] = useState<TaskOccurrencesResponse[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [loading, setLoading] = useState(true);
  const [editingEvt, setEditingEvt] = useState<CalendarEvent | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [formDate, setFormDate] = useState<Date>(new Date());
  const [formErr, setFormErr] = useState<string | null>(null);

  const range = useMemo(() => {
    const from = new Date(year, month, 1, 0, 0, 0, 0);
    from.setDate(1 - from.getDay());
    const to = new Date(year, month, 1, 0, 0, 0, 0);
    to.setDate(to.getDate() + 42 - from.getDate());
    return { from: from.toISOString(), to: to.toISOString(), fromYmd: ymd(from), toYmd: ymd(addDays(to, -1)) };
  }, [year, month]);

  useEffect(() => {
    const run = async () => {
      setLoading(true);
      try {
        const [evRes, taskRes, occRes, courseRes] = await Promise.all([
          api.get<CalendarEvent[]>(`/api/calendar?from=${range.from}&to=${range.to}`),
          api.get<Task[]>(`/api/tasks?filter=all&from=${range.fromYmd}&to=${range.toYmd}`),
          api.get<TaskOccurrencesResponse[]>(`/api/tasks/occurrences?from=${range.fromYmd}&to=${range.toYmd}`),
          api.get<Course[]>("/api/courses"),
        ]);
        if ("ok" in evRes && evRes.ok) setEvents(evRes.data);
        if ("ok" in taskRes && taskRes.ok) setTasks(taskRes.data);
        if ("ok" in occRes && occRes.ok) setRecurringOccurrences(occRes.data);
        if ("ok" in courseRes && courseRes.ok) setCourses(courseRes.data);
      } catch {
        setEvents([]);
      }
      setLoading(false);
    };
    void run();
  }, [range]);

  const items = useMemo<CalItem[]>(() => {
    const list: CalItem[] = [];

    for (const e of events) {
      list.push({
        key: `evt-${e.id}`,
        kind: "event",
        title: e.title,
        date: localDayKey(e.startTime),
        startTime: e.allDay ? null : localTime(e.startTime),
        endTime: e.allDay ? null : localTime(e.endTime),
        color: eventColor(e),
        event: e,
      });
    }

    // Fixed (non-recurring) tasks for the window
    for (const t of tasks) {
      if (t.isRecurring || !t.dueDate) continue;
      list.push({
        key: `task-${t.id}-${t.dueDate}`,
        kind: "task",
        title: t.title,
        date: t.dueDate,
        startTime: t.dueTime ?? null,
        endTime: null,
        color: TASK_COLOR,
        completed: t.completed,
        task: t,
        taskDate: t.dueDate,
      });
    }

    // Recurring task occurrences (expanded server-side)
    for (const occ of recurringOccurrences) {
      for (const o of occ.occurrences) {
        list.push({
          key: `task-${occ.taskId}-${o.date}`,
          kind: "task",
          title: occ.title,
          date: o.date,
          startTime: null,
          endTime: null,
          color: TASK_COLOR,
          completed: o.completed,
          task: tasks.find((t) => t.id === occ.taskId),
          taskDate: o.date,
        });
      }
    }

    // Classes from course timetables — expanded across the visible window
    for (const c of courses) {
      for (const slot of c.schedule) {
        let d = new Date(range.fromYmd + "T12:00:00");
        const end = new Date(range.toYmd + "T12:00:00");
        while (d <= end) {
          if (d.getDay() === slot.dayOfWeek) {
            list.push({
              key: `class-${c.id}-${slot.dayOfWeek}-${slot.startTime}-${ymd(d)}`,
              kind: "class",
              title: c.name,
              date: ymd(d),
              startTime: slot.startTime,
              endTime: slot.endTime,
              color: courseColor(c.id),
              course: c,
            });
          }
          d = addDays(d, 1);
        }
      }
    }

    return list.sort((a, b) => {
      const ta = a.startTime ?? "00:00";
      const tb = b.startTime ?? "00:00";
      if (ta !== tb) return ta < tb ? -1 : 1;
      return a.title.localeCompare(b.title);
    });
  }, [events, tasks, recurringOccurrences, courses, range]);

  const filtered = useMemo(() => (filter === "all" ? items : items.filter((i) => i.kind === filter)), [items, filter]);

  const itemsByDay = useMemo(() => {
    const map = new Map<string, CalItem[]>();
    for (const it of filtered) {
      const l = map.get(it.date) ?? [];
      l.push(it);
      map.set(it.date, l);
    }
    return map;
  }, [filtered]);

  const weeks = useMemo(() => monthMatrix(year, month), [year, month]);

  const counts = useMemo(
    () => ({
      event: items.filter((i) => i.kind === "event").length,
      task: items.filter((i) => i.kind === "task").length,
      class: items.filter((i) => i.kind === "class").length,
    }),
    [items],
  );

  const deleteEvent = async (id: string) => {
    if (!confirm("Delete this event?")) return;
    try {
      await api.delete(`/api/calendar/${id}`);
      setEvents((prev) => prev.filter((e) => e.id !== id));
    } catch {
      setFormErr("Delete failed");
    }
  };

  const todayKey = new Date().toLocaleDateString("en-CA");

  const Chip = useCallback(
    ({ item }: { item: CalItem }) => {
      const time = item.startTime ? `${item.startTime}${item.endTime ? `–${item.endTime}` : ""}` : "All day";
      if (item.kind === "event") {
        return (
          <button
            onClick={(ev) => { ev.stopPropagation(); if (item.event) { setEditingEvt(item.event); setFormErr(null); setShowForm(true); } }}
            className="block w-full truncate rounded px-1.5 py-0.5 text-left text-[11px] font-medium text-[#0b0e14] transition-transform hover:scale-[1.02]"
            style={{ backgroundColor: item.color }}
          >
            {item.startTime ? `${time} ` : ""}{item.title}
          </button>
        );
      }
      if (item.kind === "class") {
        return (
          <div
            className="block w-full truncate rounded-r-md border-l-2 px-1.5 py-0.5 text-[11px] font-medium text-text"
            style={{ borderColor: item.color, backgroundColor: `${item.color}22` }}
            title={`${item.title} class · ${time}`}
          >
            {time} {item.title}
          </div>
        );
      }
      return (
        <button
          onClick={(ev) => {
            ev.stopPropagation();
            if (item.task?.id) {
              void api.post(`/api/tasks/${item.task.id}/complete`, {
                completed: !item.completed,
                ...(item.taskDate ? { occurrenceDate: item.taskDate } : {}),
              });
              setTasks((prev) => prev.map((t) => (t.id === item.task?.id ? { ...t, completed: !item.completed } : t)));
              setRecurringOccurrences((prev) =>
                prev.map((o) => ({
                  ...o,
                  occurrences: o.occurrences.map((occ) =>
                    occ.date === item.taskDate ? { ...occ, completed: !item.completed } : occ,
                  ),
                })),
              );
            }
          }}
          className={`block w-full truncate rounded-md border border-dashed px-1.5 py-0.5 text-left text-[11px] text-text transition-opacity ${item.completed ? "opacity-40" : "hover:opacity-80"}`}
          style={{ borderColor: item.color }}
          title={`${item.title} · task · click to ${item.completed ? "reopen" : "complete"}`}
        >
          <span className="mr-1 inline-block h-2 w-2 rounded-full align-middle" style={{ backgroundColor: item.color }} />
          {item.startTime ? `${time} ` : ""}{item.title}
        </button>
      );
    },
    [],
  );

  const PILLS: { key: Filter; label: string }[] = [
    { key: "all", label: "All" },
    { key: "event", label: "Events" },
    { key: "task", label: "Tasks" },
    { key: "class", label: "Classes" },
  ];

  return (
    <AppShell>
      <div className="space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Calendar</h1>
            <p className="mt-1 text-sm text-text-muted">
              {loading ? "Loading…" : `${counts.event} event${counts.event !== 1 ? "s" : ""} · ${counts.task} task${counts.task !== 1 ? "s" : ""} · ${counts.class} class${counts.class !== 1 ? "es" : ""}`}
            </p>
          </div>
          <button onClick={() => {
            setEditingEvt(null);
            setFormDate(new Date());
            setFormErr(null);
            setShowForm(true);
          }}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover">
            New event
          </button>
        </header>

        {/* Filters — combined or per-type */}
        <Reveal delay={0}>
          <div className="flex flex-wrap gap-1 rounded-lg border border-border bg-surface p-1">
            {PILLS.map((p) => (
              <button key={p.key} onClick={() => setFilter(p.key)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  filter === p.key ? "bg-surface-elevated text-text" : "text-text-muted hover:text-text"
                }`}>
                {p.label}
                {p.key !== "all" && <span className="ml-1.5 opacity-70">({counts[p.key]})</span>}
              </button>
            ))}
          </div>
        </Reveal>

        <div className="rounded-2xl border border-border bg-surface">
          <div className="flex items-center justify-between p-4">
            <button onClick={() => { if (month === 0) { setYear(year - 1); setMonth(11); } else setMonth(month - 1); }}
              className="rounded-lg border border-border px-3 py-1.5 text-sm text-text-muted transition-colors hover:border-[#333a48] hover:text-text">‹</button>
            <h2 className="text-base font-semibold text-text">
              {new Date(year, month).toLocaleDateString(undefined, { month: "long", year: "numeric" })}
            </h2>
            <button onClick={() => { if (month === 11) { setYear(year + 1); setMonth(0); } else setMonth(month + 1); }}
              className="rounded-lg border border-border px-3 py-1.5 text-sm text-text-muted transition-colors hover:border-[#333a48] hover:text-text">›</button>
          </div>

          <div className="grid grid-cols-7 border-t border-border">
            {DAY_NAMES.map((d) => (
              <div key={d} className="border-b border-border px-2 py-2 text-center text-[10px] font-medium uppercase tracking-wider text-text-muted">
                {d}
              </div>
            ))}
          </div>

          {weeks.map((week, wi) => (
            <div key={wi} className="grid grid-cols-7">
              {week.map((date, di) => {
                if (!date) return <div key={di} className="min-h-24 border-r border-border bg-[#0b0e14]" />;
                const key = date.toLocaleDateString("en-CA");
                const dayItems = itemsByDay.get(key) ?? [];
                const isToday = key === todayKey;
                return (
                  <div key={key}
                    className={`min-h-24 cursor-pointer border-r border-border p-1.5 transition-colors hover:bg-surface-elevated ${date.getMonth() !== month ? "bg-[#0b0e14] opacity-60" : ""}`}
                    onClick={() => { setEditingEvt(null); setFormDate(date); setFormErr(null); setShowForm(true); }}>
                    <div className={`mb-1 inline-flex h-6 w-6 items-center justify-center rounded-full text-xs ${isToday ? "bg-accent font-semibold text-white" : "text-text-muted"}`}>
                      {date.getDate()}
                    </div>
                    <div className="space-y-0.5">
                      {dayItems.slice(0, 4).map((item) => <Chip key={item.key} item={item} />)}
                      {dayItems.length > 4 && (
                        <div className="px-1.5 text-[10px] text-text-muted">+{dayItems.length - 4} more</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-4 text-xs text-text-muted">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-[#8fb0ff]" /> Events
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm border border-dashed border-[#9be08f]" /> Tasks
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm border-l-2 border-[#5ce09e] bg-[#5ce09e22]" /> Classes
          </span>
          <span className="text-text-muted/70">Click a task to complete it; click an event to edit; classes come from your timetable.</span>
        </div>

        {showForm && (
          <EventForm
            editing={editingEvt}
            defaultDate={formDate}
            error={formErr}
            onCancel={() => setShowForm(false)}
            onSaved={(evt) => {
              setEvents((prev) => {
                if (editingEvt) return prev.map((e) => (e.id === evt.id ? evt : e));
                return [...prev.filter((e) => e.id !== evt.id), evt];
              });
              setShowForm(false);
            }}
            onDelete={editingEvt ? () => void deleteEvent(editingEvt.id) : undefined}
          />
        )}
      </div>
    </AppShell>
  );
}

function EventForm({ editing, defaultDate, error, onCancel, onSaved, onDelete }: {
  editing: CalendarEvent | null;
  defaultDate: Date;
  error: string | null;
  onCancel: () => void;
  onSaved: (e: CalendarEvent) => void;
  onDelete?: () => void;
}) {
  const [title, setTitle] = useState(editing?.title ?? "");
  const [date, setDate] = useState(editing ? localDayKey(editing.startTime) : localDayKey(defaultDate.toISOString()));
  const [startTime, setStartTime] = useState(editing ? localTime(editing.startTime) : "09:00");
  const [endTime, setEndTime] = useState(editing ? localTime(editing.endTime) : "10:00");
  const [allDay, setAllDay] = useState(editing?.allDay ?? false);
  const [location, setLocation] = useState(editing?.location ?? "");
  const [description, setDescription] = useState(editing?.description ?? "");
  const [color, setColor] = useState(editing?.color ?? EVENT_COLORS[0]);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(error);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    setErr(null);
    const body: CreateCalendarEventRequest = {
      title: title.trim(),
      startTime: `${date}T${allDay ? "00:00:00" : `${startTime}:00`}`,
      endTime: `${date}T${allDay ? "23:59:59" : `${endTime}:00`}`,
      allDay,
      location: location.trim() || null,
      description: description.trim() || null,
      color,
    };
    try {
      let res;
      if (editing) res = await api.patch<CalendarEvent>(`/api/calendar/${editing.id}`, body);
      else res = await api.post<CalendarEvent>("/api/calendar", body);
      const data = (res as { data?: CalendarEvent }).data;
      if (data && !("queued" in (data as object))) onSaved(data);
      else onCancel();
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onCancel}>
      <form onSubmit={submit} onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md space-y-3 rounded-2xl border border-border bg-surface p-5">
        <h3 className="text-base font-semibold text-text">{editing ? "Edit event" : "New event"}</h3>
        {err && <p className="text-sm text-danger">{err}</p>}

        <label className="block text-xs text-text-muted">
          Title
          <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} required
            className="mt-1 w-full rounded-lg border border-border bg-surface-elevated px-3 py-2 text-sm text-text outline-none focus:border-accent" />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="text-xs text-text-muted">
            Date
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required
              className="mt-1 w-full rounded-lg border border-border bg-surface-elevated px-3 py-2 text-sm text-text outline-none focus:border-accent" />
          </label>
          <label className="flex items-end gap-2 pb-2 text-xs text-text-muted">
            <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} className="accent-accent" />
            All day
          </label>
        </div>

        {!allDay && (
          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs text-text-muted">
              Starts
              <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} required
                className="mt-1 w-full rounded-lg border border-border bg-surface-elevated px-3 py-2 text-sm text-text outline-none focus:border-accent" />
            </label>
            <label className="text-xs text-text-muted">
              Ends
              <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} required
                className="mt-1 w-full rounded-lg border border-border bg-surface-elevated px-3 py-2 text-sm text-text outline-none focus:border-accent" />
            </label>
          </div>
        )}

        <label className="block text-xs text-text-muted">
          Location
          <input value={location} onChange={(e) => setLocation(e.target.value)}
            className="mt-1 w-full rounded-lg border border-border bg-surface-elevated px-3 py-2 text-sm text-text outline-none focus:border-accent" />
        </label>
        <label className="block text-xs text-text-muted">
          Notes
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2}
            className="mt-1 w-full rounded-lg border border-border bg-surface-elevated px-3 py-2 text-sm text-text outline-none focus:border-accent" />
        </label>

        <div>
          <p className="mb-1 text-xs text-text-muted">Color</p>
          <div className="flex gap-2">
            {EVENT_COLORS.map((c) => (
              <button key={c} type="button" onClick={() => setColor(c)}
                className={`h-6 w-6 rounded-full transition-transform ${color === c ? "ring-2 ring-white" : "hover:scale-110"}`}
                style={{ backgroundColor: c }} />
            ))}
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          {onDelete && (
            <button type="button" onClick={onDelete}
              className="mr-auto rounded-lg px-4 py-2 text-sm text-danger transition-colors hover:bg-surface-elevated">
              Delete
            </button>
          )}
          <button type="button" onClick={onCancel}
            className="rounded-lg px-4 py-2 text-sm text-text-muted transition-colors hover:bg-surface-elevated">Cancel</button>
          <button type="submit" disabled={saving}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50">
            {saving ? "…" : "Save"}
          </button>
        </div>
      </form>
    </div>
  );
}