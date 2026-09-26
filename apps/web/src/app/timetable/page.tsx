"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import {
  COURSE_SLOT_TYPES,
  TIMETABLE_ENTRY_KINDS,
  type Course,
  type CourseScheduleSlot,
  type CourseSlotType,
  type TimetableEntry,
  type TimetableEntryKind,
  type TimetableOccurrence,
  type TimetableWeek,
  type UpdateCourseRequest,
} from "@prodapp/shared-types";
import { api } from "@/lib/api";
import {
  DAYS,
  WEEK_DAYS,
  timeToMinutes,
  COURSE_PALETTE,
  SLOT_KIND_META,
  ENTRY_KIND_META,
  weekStartOf,
  weekDates,
  addDays,
  todayKey,
  formatDayLabel,
} from "@/lib/timetable";
import { AppShell } from "@/components/AppShell";
import { Reveal } from "@/components/Reveal";
import { ScreenshotImport } from "@/components/timetable/ScreenshotImport";
import { UploadIcon, ChevronLeftIcon, ChevronRightIcon } from "@/components/icons";

interface SlotEditorState {
  courseId: string;
  index: number;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  type: CourseSlotType;
  weekNumber: number | null;
  location: string;
}

interface EntryDraft {
  kind: TimetableEntryKind;
  courseId: string;
  title: string;
  date: string;
  startTime: string;
  endTime: string;
  allDay: boolean;
  location: string;
  notes: string;
  /** Only for RESCHEDULED: which weekly slot is being moved. */
  replacesCourseId: string;
  replacesDay: number;
  replacesStart: string;
  replacesEnd: string;
}

const emptyDraft = (date: string): EntryDraft => ({
  kind: "EVENT",
  courseId: "",
  title: "",
  date,
  startTime: "09:00",
  endTime: "10:00",
  allDay: false,
  location: "",
  notes: "",
  replacesCourseId: "",
  replacesDay: 1,
  replacesStart: "09:00",
  replacesEnd: "10:00",
});

export default function TimetablePage() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [showImport, setShowImport] = useState(false);
  const [editingSlot, setEditingSlot] = useState<SlotEditorState | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The resolved week: recurring slots plus every dated exception, already
  // applied server-side so the grid and the day model cannot disagree.
  const [weekStart, setWeekStart] = useState(() => weekStartOf(todayKey()));
  // Keyed by the week it was fetched for, so navigating away and back shows the
  // right loading state without a second boolean that can disagree with it.
  const [weekState, setWeekState] = useState<{ start: string; data: TimetableWeek | null } | null>(null);
  const [draft, setDraft] = useState<EntryDraft | null>(null);
  const [editingEntry, setEditingEntry] = useState<TimetableEntry | null>(null);

  // "Add class time" form state
  // Empty means "no explicit choice", in which case the first course is used.
  const [addCourseChoice, setAddCourseChoice] = useState("");
  const [addDay, setAddDay] = useState(1);
  const [addStart, setAddStart] = useState("09:00");
  const [addEnd, setAddEnd] = useState("10:30");
  const [addType, setAddType] = useState<CourseSlotType>("CLASS");
  const [addWeekNumber, setAddWeekNumber] = useState("");
  const [addLocation, setAddLocation] = useState("");

  const load = useCallback(async () => {
    const res = await api.get<Course[]>("/api/courses");
    if ("ok" in res && res.ok) setCourses(res.data);
    setLoading(false);
  }, []);

  const loadWeek = useCallback(async (start: string) => {
    const res = await api.get<TimetableWeek>(`/api/timetable/week?week=${start}`);
    setWeekState({ start, data: "ok" in res && res.ok ? res.data : null });
  }, []);

  useEffect(() => { void load(); }, [load]);
  // No cancellation needed: a late reply for a week the user has already
  // navigated away from is dropped by the `start` key in `weekState`.
  useEffect(() => { void loadWeek(weekStart); }, [weekStart, loadWeek]);

  // Derived rather than mirrored into state: if the chosen course disappears
  // (deleted, or the list reloaded) we fall back to the first one without an
  // effect that writes state during render.
  const addCourseId =
    addCourseChoice && courses.some((c) => c.id === addCourseChoice)
      ? addCourseChoice
      : (courses[0]?.id ?? "");

  const updateSchedule = async (courseId: string, schedule: CourseScheduleSlot[]) => {
    setSaving(true);
    setError(null);
    try {
      const body: UpdateCourseRequest = { schedule };
      const res = await api.patch(`/api/courses/${courseId}`, body);
      if ("ok" in res && !res.ok) setError("Failed to save the timetable.");
      else await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save the timetable.");
    } finally {
      setSaving(false);
    }
  };

  const addSlot = async () => {
    const course = courses.find((c) => c.id === addCourseId);
    if (!course) { setError("Add a course first."); return; }
    if (timeToMinutes(addEnd) <= timeToMinutes(addStart)) {
      setError("End time must be after the start time.");
      return;
    }
    const slot: CourseScheduleSlot = {
      dayOfWeek: addDay,
      startTime: addStart,
      endTime: addEnd,
      type: addType,
      weekNumber: addWeekNumber ? Number(addWeekNumber) : null,
      location: addLocation.trim() || null,
    };
    const dup = course.schedule.some(
      (s) => s.dayOfWeek === slot.dayOfWeek && s.startTime === slot.startTime && s.endTime === slot.endTime,
    );
    if (dup) { setError("That class time already exists."); return; }
    await updateSchedule(course.id, [...course.schedule, slot]);
    setAddWeekNumber("");
    setAddLocation("");
  };

  const saveSlotEdit = async () => {
    if (!editingSlot) return;
    const course = courses.find((c) => c.id === editingSlot.courseId);
    if (!course) return;
    const next = [...course.schedule];
    // Spread the original slot so a field this editor does not show is not
    // silently dropped on save.
    next[editingSlot.index] = {
      ...next[editingSlot.index],
      dayOfWeek: editingSlot.dayOfWeek,
      startTime: editingSlot.startTime,
      endTime: editingSlot.endTime,
      type: editingSlot.type,
      weekNumber: editingSlot.weekNumber,
      location: editingSlot.location.trim() || null,
    };
    await updateSchedule(course.id, next);
    setEditingSlot(null);
  };

  const deleteSlot = async () => {
    if (!editingSlot) return;
    const course = courses.find((c) => c.id === editingSlot.courseId);
    if (!course) return;
    const next = course.schedule.filter((_, i) => i !== editingSlot.index);
    await updateSchedule(course.id, next);
    setEditingSlot(null);
  };

  const confirmImport = async (entries: { courseName: string; dayOfWeek: number; startTime: string; endTime: string }[]) => {
    setError(null);
    for (const entry of entries) {
      const name = entry.courseName.trim();
      if (!name) continue;
      const existing = courses.find((c) => c.name.toLowerCase() === name.toLowerCase());
      const slot: CourseScheduleSlot = {
        dayOfWeek: entry.dayOfWeek,
        startTime: entry.startTime,
        endTime: entry.endTime,
      };
      if (existing) {
        const dup = existing.schedule.some(
          (s) => s.dayOfWeek === slot.dayOfWeek && s.startTime === slot.startTime && s.endTime === slot.endTime,
        );
        await api.patch(`/api/courses/${existing.id}`, { schedule: dup ? existing.schedule : [...existing.schedule, slot] } satisfies UpdateCourseRequest);
      } else {
        await api.post("/api/courses", { name, schedule: [slot] });
      }
    }
    await load();
  };

  // ---------- One-off entries ----------

  const saveEntry = async () => {
    if (!draft) return;
    if (!draft.title.trim()) { setError("Give the entry a title."); return; }
    if (draft.kind === "RESCHEDULED" && !draft.replacesCourseId) {
      setError("A rescheduled class has to name the class it moves.");
      return;
    }
    setSaving(true);
    setError(null);
    const body = {
      kind: draft.kind,
      title: draft.title.trim(),
      date: draft.date,
      courseId: draft.kind === "HOLIDAY" ? null : draft.courseId || null,
      startTime: draft.allDay ? null : draft.startTime,
      endTime: draft.allDay ? null : draft.endTime,
      location: draft.location.trim() || null,
      notes: draft.notes.trim() || null,
      replacesSlot:
        draft.kind === "RESCHEDULED"
          ? {
              dayOfWeek: draft.replacesDay,
              startTime: draft.replacesStart,
              endTime: draft.replacesEnd,
            }
          : null,
    };
    const res = editingEntry
      ? await api.patch(`/api/timetable/entries/${editingEntry.id}`, body)
      : await api.post("/api/timetable/entries", body);
    if ("ok" in res && !res.ok) {
      setError(res.error?.message ?? "Could not save that entry.");
    } else {
      setDraft(null);
      setEditingEntry(null);
      await loadWeek(weekStart);
    }
    setSaving(false);
  };

  const deleteEntry = async (entry: TimetableEntry) => {
    setSaving(true);
    setError(null);
    const res = await api.delete(`/api/timetable/entries/${entry.id}`);
    if ("ok" in res && !res.ok) setError(res.error?.message ?? "Could not remove that entry.");
    else {
      if (editingEntry?.id === entry.id) { setEditingEntry(null); setDraft(null); }
      await loadWeek(weekStart);
    }
    setSaving(false);
  };

  const openEntryDraft = (entry: TimetableEntry) => {
    setEditingEntry(entry);
    setDraft({
      kind: entry.kind,
      courseId: entry.courseId ?? "",
      title: entry.title,
      date: entry.date,
      startTime: entry.startTime ?? "09:00",
      endTime: entry.endTime ?? "10:00",
      allDay: entry.startTime === null,
      location: entry.location ?? "",
      notes: entry.notes ?? "",
      replacesCourseId: entry.courseId ?? "",
      replacesDay: entry.replacesSlot?.dayOfWeek ?? 1,
      replacesStart: entry.replacesSlot?.startTime ?? "09:00",
      replacesEnd: entry.replacesSlot?.endTime ?? "10:00",
    });
  };

  /** Start a reschedule from an existing class, prefilled with its real slot. */
  const startReschedule = (o: TimetableOccurrence) => {
    const index = slotIndexOf(o.courseId, o.startTime);
    const original = courseById.get(o.courseId)?.schedule[index];
    setEditingEntry(null);
    setDraft({
      ...emptyDraft(o.date),
      kind: "RESCHEDULED",
      courseId: o.courseId,
      title: o.courseName,
      date: o.date,
      startTime: o.startTime,
      endTime: o.endTime,
      replacesCourseId: o.courseId,
      replacesDay: original?.dayOfWeek ?? o.dayOfWeek,
      replacesStart: original?.startTime ?? o.startTime,
      replacesEnd: original?.endTime ?? o.endTime,
    });
  };

  // ---------- Weekly grid ----------

  const week = weekState?.start === weekStart ? weekState.data : null;
  const weekLoading = weekState?.start !== weekStart;
  const dates = useMemo(() => weekDates(weekStart), [weekStart]);
  const occurrences = useMemo(() => week?.occurrences ?? [], [week]);

  // Vertical scale (px per hour). Blocks sit at their real time so free periods
  // (e.g. 11:00–11:30, 13:30–14:30) stay visibly empty.
  const HOUR_PX = 64;

  const gridRange = useMemo(() => {
    let min = 9 * 60;
    let max = 17 * 60;
    for (const o of occurrences) {
      if (!o.happens) continue;
      min = Math.min(min, timeToMinutes(o.startTime));
      max = Math.max(max, timeToMinutes(o.endTime));
    }
    min = Math.floor(min / 60) * 60;
    max = Math.ceil(max / 60) * 60;
    if (max - min < 4 * 60) max = max + 60;
    return { min, max };
  }, [occurrences]);

  const columnHeight = ((gridRange.max - gridRange.min) / 60) * HOUR_PX;

  // Group by date, ordered by start time. Colour-coded subject blocks only —
  // no time text on the grid.
  const perDate = useMemo(() => {
    const days: TimetableOccurrence[][] = Array.from({ length: 7 }, () => []);
    for (const o of occurrences) {
      const i = dates.indexOf(o.date);
      if (i >= 0) days[i].push(o);
    }
    for (const d of days) d.sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));
    return days;
  }, [occurrences, dates]);

  // A holiday frees the whole day, so the column is drawn empty on purpose and
  // labelled, rather than looking like a bug.
  const holidayByDate = useMemo(() => {
    const map = new Map<string, TimetableOccurrence>();
    for (const o of occurrences) {
      if (o.type === "HOLIDAY" && o.happens && !map.has(o.date)) map.set(o.date, o);
    }
    return map;
  }, [occurrences]);

  // Index for the edit modal, which works off a course's own slot list.
  const courseById = new Map(courses.map((c) => [c.id, c]));
  const slotIndexOf = (courseId: string, startTime: string) =>
    courseById.get(courseId)?.schedule.findIndex((s) => s.startTime === startTime) ?? -1;

  // Assign a unique palette colour to every course so no two subjects share a
  // colour (modulo palette overflow which is unlikely for a real timetable).
  const distinctColor = useMemo(() => {
    const map = new Map<string, string>();
    [...courses]
      .sort((a, b) => a.id.localeCompare(b.id))
      .forEach((c, i) => map.set(c.id, COURSE_PALETTE[i % COURSE_PALETTE.length]));
    return (id: string) => map.get(id) ?? COURSE_PALETTE[0];
  }, [courses]);


  return (
    <AppShell>
      <div className="space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Timetable</h1>
            <p className="mt-1 text-sm text-text-muted">
              {loading
                ? "Loading…"
                : weekLoading
                  ? `Week ${week?.weekNumber ?? "…"} · loading`
                  : `${occurrences.filter((o) => o.happens).length} happening across ${courses.length} course${courses.length !== 1 ? "s" : ""}`}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 rounded-lg border border-border bg-surface px-1 py-1">
              <button
                onClick={() => setWeekStart((w) => addDays(w, -7))}
                aria-label="Previous week"
                className="rounded-md p-1.5 text-text-muted transition-colors hover:bg-surface-elevated hover:text-text"
              >
                <ChevronLeftIcon className="h-4 w-4" />
              </button>
              <span className="px-1 text-xs text-text-muted">
                {week ? `Week ${week.weekNumber} · ${formatDayLabel(week.weekStart)}` : "—"}
              </span>
              <button
                onClick={() => setWeekStart((w) => addDays(w, 7))}
                aria-label="Next week"
                className="rounded-md p-1.5 text-text-muted transition-colors hover:bg-surface-elevated hover:text-text"
              >
                <ChevronRightIcon className="h-4 w-4" />
              </button>
            </div>
            <button
              onClick={() => setWeekStart(weekStartOf(todayKey()))}
              className="rounded-lg border border-border px-3 py-2 text-sm text-text-muted transition-colors hover:border-[#333a48] hover:text-text"
            >
              This week
            </button>
            <button
              onClick={() => { setEditingEntry(null); setDraft(emptyDraft(dates[0] ?? weekStart)); }}
              className="rounded-lg border border-border px-3 py-2 text-sm text-text-muted transition-colors hover:border-[#333a48] hover:text-text"
            >
              Add entry
            </button>
            {!showImport && courses.length > 0 && (
              <button onClick={() => setShowImport(true)}
                className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm text-text-muted transition-colors hover:border-[#333a48] hover:text-text">
                <UploadIcon className="h-4 w-4" />
                Import from screenshot
              </button>
            )}
          </div>
        </header>

        {error && (
          <div className="rounded-xl border border-[#3a1e24] bg-[#2a1418] px-4 py-3 text-sm text-[#f0a6a6]">{error}</div>
        )}

        {showImport && (
          <Reveal delay={0}>
            <ScreenshotImport onConfirm={confirmImport} onCancel={() => setShowImport(false)} />
          </Reveal>
        )}

        {!loading && courses.length === 0 && !showImport && (
          <div className="rounded-2xl border border-dashed border-border py-14 text-center">
            <p className="text-sm text-text-muted">No courses yet.</p>
            <p className="mt-1 text-xs text-text-muted">Add courses on the Courses page, or import a class schedule from a screenshot above.</p>
          </div>
        )}

        {courses.length > 0 && (
          <>
            {/* Add a class time */}
            <Reveal delay={0}>
              <section className="rounded-2xl border border-border bg-surface p-5">
                <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-text-muted">Add a class time</h2>
                <div className="flex flex-wrap items-end gap-2">
                  <label className="text-xs text-text-muted">
                    Course
                    <select value={addCourseId} onChange={(e) => setAddCourseChoice(e.target.value)}
                      className="mt-1 block w-40 rounded-lg border border-border bg-surface-elevated px-2 py-2 text-sm text-text outline-none focus:border-accent">
                      {courses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </label>
                  <label className="text-xs text-text-muted">
                    Day
                    <select value={addDay} onChange={(e) => setAddDay(Number(e.target.value))}
                      className="mt-1 block w-24 rounded-lg border border-border bg-surface-elevated px-2 py-2 text-sm text-text outline-none focus:border-accent">
                      {DAYS.map((d, i) => <option key={i} value={i}>{d}</option>)}
                    </select>
                  </label>
                  <label className="text-xs text-text-muted">
                    From
                    <input type="time" value={addStart} onChange={(e) => setAddStart(e.target.value)}
                      className="mt-1 block w-28 rounded-lg border border-border bg-surface-elevated px-2 py-2 text-sm text-text outline-none focus:border-accent" />
                  </label>
                  <label className="text-xs text-text-muted">
                    To
                    <input type="time" value={addEnd} onChange={(e) => setAddEnd(e.target.value)}
                      className="mt-1 block w-28 rounded-lg border border-border bg-surface-elevated px-2 py-2 text-sm text-text outline-none focus:border-accent" />
                  </label>
                  <label className="text-xs text-text-muted">
                    Kind
                    <select value={addType} onChange={(e) => setAddType(e.target.value as CourseSlotType)}
                      className="mt-1 block w-28 rounded-lg border border-border bg-surface-elevated px-2 py-2 text-sm text-text outline-none focus:border-accent">
                      {COURSE_SLOT_TYPES.map((t) => (
                        <option key={t} value={t}>{SLOT_KIND_META[t].label}</option>
                      ))}
                    </select>
                  </label>
                  <label className="text-xs text-text-muted">
                    Week
                    <input type="number" min={1} max={60} placeholder="every" value={addWeekNumber}
                      onChange={(e) => setAddWeekNumber(e.target.value)}
                      className="mt-1 block w-20 rounded-lg border border-border bg-surface-elevated px-2 py-2 text-sm text-text outline-none focus:border-accent placeholder:text-text-muted/50" />
                  </label>
                  <label className="text-xs text-text-muted">
                    Location
                    <input type="text" placeholder="optional" value={addLocation}
                      onChange={(e) => setAddLocation(e.target.value)}
                      className="mt-1 block w-32 rounded-lg border border-border bg-surface-elevated px-2 py-2 text-sm text-text outline-none focus:border-accent placeholder:text-text-muted/50" />
                  </label>
                  <button onClick={() => void addSlot()} disabled={saving}
                    className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50">
                    {saving ? "…" : "Add"}
                  </button>
                </div>
                <p className="mt-2 text-[11px] text-text-muted/70">
                  {addWeekNumber
                    ? `Only runs in week ${addWeekNumber}.`
                    : "Runs every week."}{" "}
                  Only a class counts towards attendance; labs, exams and internal slots do not.
                </p>
              </section>
            </Reveal>

            {/* Weekly grid */}
            <div className="overflow-x-auto">
              <div className="min-w-[720px]">
                <div className="grid grid-cols-7 gap-2">
                  {WEEK_DAYS.map((d, i) => {
                    const isToday = dates[i] === todayKey();
                    return (
                      <div key={d} className={`px-1 py-1 text-center text-[10px] font-medium uppercase tracking-wider ${isToday ? "text-accent" : "text-text-muted"}`}>
                        {d}
                        <div className="mt-0.5 text-[9px] font-normal normal-case tracking-normal opacity-60">
                          {dates[i] ? dates[i].slice(8) : ""}
                        </div>
                      </div>
                    );
                  })}
                  {perDate.map((items, i) => {
                    const holiday = holidayByDate.get(dates[i]);
                    return (
                      <div
                        key={i}
                        className={`relative rounded-xl border bg-surface ${holiday ? "border-[#1c3a29]" : "border-border"}`}
                        style={{ height: columnHeight }}
                      >
                        {holiday && (
                          <div className="absolute inset-x-0 top-0 z-20 bg-[#12301f]/95 px-2 py-1 text-center text-[10px] font-medium text-[#7fe0a8]">
                            {holiday.courseName}
                          </div>
                        )}
                        {items.length === 0 && !holiday && (
                          <div className="absolute inset-0 flex items-center justify-center text-[10px] text-text-muted/40">
                            —
                          </div>
                        )}
                        {items.map((o) => {
                          // An all-day or free-floating entry is pinned to the
                          // top of the column rather than given a fake time.
                          const anchored = o.startTime !== "00:00";
                          const startMin = anchored ? timeToMinutes(o.startTime) : gridRange.min;
                          const endMin = anchored ? timeToMinutes(o.endTime) : gridRange.min + 60;
                          const top = ((startMin - gridRange.min) / 60) * HOUR_PX + 3;
                          const height = Math.max(22, ((endMin - startMin) / 60) * HOUR_PX - 6);
                          const kind = SLOT_KIND_META[o.type];
                          const color = o.courseId ? distinctColor(o.courseId) : "#9aa4b8";
                          const cancellable = o.entryId === null && !o.moved;
                          return (
                            <div
                              key={o.key}
                              className={`absolute left-1 right-1 z-10 overflow-hidden rounded-lg px-2.5 text-left text-[13px] leading-tight transition-transform hover:z-20 ${
                                o.happens ? "font-semibold" : "opacity-40"
                              }`}
                              style={{
                                top,
                                height,
                                backgroundColor: o.happens ? color : "transparent",
                                color: o.happens ? "#0b0e14" : undefined,
                                border: o.happens ? undefined : `1px dashed ${color}`,
                                textDecoration: o.happens ? undefined : "line-through",
                              }}
                            >
                              <button
                                type="button"
                                onClick={() => {
                                  if (!cancellable) return;
                                  const index = slotIndexOf(o.courseId, o.startTime);
                                  const slot = courseById.get(o.courseId)?.schedule[index];
                                  if (index < 0 || !slot) return;
                                  setEditingSlot({
                                    courseId: o.courseId,
                                    index,
                                    dayOfWeek: slot.dayOfWeek,
                                    startTime: slot.startTime,
                                    endTime: slot.endTime,
                                    type: o.type,
                                    weekNumber: o.weekNumber,
                                    location: o.location ?? "",
                                  });
                                }}
                                title={o.happens ? `${o.courseName} · ${o.startTime}–${o.endTime}` : `Cancelled — ${o.cancelledReason}`}
                                className={`block w-full truncate text-left ${cancellable ? "cursor-pointer" : "cursor-default"}`}
                              >
                                {kind.mark && <span className="mr-1 opacity-60">{kind.mark}</span>}
                                {o.courseName}
                              </button>
                              {!o.happens && o.cancelledReason && (
                                <span className="block truncate text-[9px] font-normal opacity-80">{o.cancelledReason}</span>
                              )}
                              {o.moved && o.entryId && (
                                <span className="absolute right-1.5 top-1.5">
                                  <button
                                    type="button"
                                    onClick={() => startReschedule(o)}
                                    title="Move this class somewhere else"
                                    className="rounded bg-black/25 px-1 text-[9px] font-normal"
                                  >
                                    move
                                  </button>
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Every class belongs to one course */}
            {courses.length > 0 && (
              <section className="space-y-2">
                <h2 className="text-sm font-medium uppercase tracking-wider text-text-muted">Your courses</h2>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {courses.map((c) => (
                    <div key={c.id} className="rounded-xl border border-border bg-surface p-3">
                      <p className="text-sm font-medium" style={{ color: distinctColor(c.id) }}>
                        {c.name}
                        <span className="ml-2 text-[10px] font-normal text-text-muted">
                          {c.schedule.length} weekly meeting{c.schedule.length !== 1 ? "s" : ""}
                        </span>
                      </p>
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {c.schedule.map((s, i) => {
                          const type = s.type ?? "CLASS";
                          const meta = SLOT_KIND_META[type];
                          return (
                            <span key={i} className={`rounded px-1.5 py-0.5 text-[10px] ${meta.badge}`}>
                              {meta.mark ? `${meta.mark} ` : ""}
                              {DAYS[s.dayOfWeek]} {s.startTime}–{s.endTime}
                              {s.weekNumber ? ` · wk ${s.weekNumber}` : ""}
                              {s.location ? ` · ${s.location}` : ""}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </>
        )}

        {/* Dated exceptions for the week on screen */}
        {week && week.entries.length > 0 && (
          <section className="space-y-2">
            <h2 className="text-sm font-medium uppercase tracking-wider text-text-muted">
              This week&rsquo;s exceptions
            </h2>
            <div className="space-y-1.5">
              {week.entries
                .slice()
                .sort((a, b) => (a.date + (a.startTime ?? "")).localeCompare(b.date + (b.startTime ?? "")))
                .map((e) => {
                  const meta = ENTRY_KIND_META[e.kind];
                  return (
                    <div key={e.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-border bg-surface px-3 py-2">
                      <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${meta.badge}`}>{meta.label}</span>
                      <span className="text-sm text-text">{e.title}</span>
                      <span className="text-xs text-text-muted">
                        {formatDayLabel(e.date)}
                        {e.startTime ? ` ${e.startTime}–${e.endTime}` : " · all day"}
                        {e.location ? ` · ${e.location}` : ""}
                      </span>
                      <span className="ml-auto flex gap-1">
                        <button onClick={() => openEntryDraft(e)}
                          className="rounded-md px-2 py-1 text-xs text-text-muted transition-colors hover:bg-surface-elevated hover:text-text">
                          Edit
                        </button>
                        <button onClick={() => void deleteEntry(e)} disabled={saving}
                          className="rounded-md px-2 py-1 text-xs text-danger transition-colors hover:bg-surface-elevated disabled:opacity-50">
                          Remove
                        </button>
                      </span>
                    </div>
                  );
                })}
            </div>
          </section>
        )}

        {/* One-off entry editor */}
        {draft && (() => {
          const meta = ENTRY_KIND_META[draft.kind];
          const course = courses.find((c) => c.id === draft.courseId);
          const slotsOfSource = draft.replacesCourseId
            ? (courseById.get(draft.replacesCourseId)?.schedule ?? [])
            : [];
          return (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => { setDraft(null); setEditingEntry(null); }}>
              <div className="w-full max-w-md max-h-[90vh] space-y-3 overflow-y-auto rounded-2xl border border-border bg-surface p-5" onClick={(e) => e.stopPropagation()}>
                <h3 className="text-base font-semibold text-text">
                  {editingEntry ? "Edit entry" : "Add a timetable entry"}
                </h3>

                <div className="flex flex-wrap gap-1">
                  {TIMETABLE_ENTRY_KINDS.map((k) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setDraft({ ...draft, kind: k })}
                      className={`rounded-lg px-2 py-1 text-xs transition-colors ${
                        draft.kind === k ? ENTRY_KIND_META[k].badge : "bg-surface-elevated text-text-muted hover:text-text"
                      }`}
                    >
                      {ENTRY_KIND_META[k].label}
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-text-muted/80">{meta.blurb}</p>

                <label className="block text-xs text-text-muted">
                  Title
                  <input
                    type="text"
                    value={draft.title}
                    onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                    placeholder={draft.kind === "HOLIDAY" ? "Founders Day" : draft.kind === "EXAM" ? "Midterm — Networks" : "Lab moved to 14:00"}
                    className="mt-1 w-full rounded-lg border border-border bg-surface-elevated px-2 py-2 text-sm text-text outline-none focus:border-accent placeholder:text-text-muted/50"
                  />
                </label>

                {draft.kind !== "HOLIDAY" && courses.length > 0 && (
                  <label className="block text-xs text-text-muted">
                    Course
                    <select value={draft.courseId} onChange={(e) => setDraft({ ...draft, courseId: e.target.value })}
                      className="mt-1 w-full rounded-lg border border-border bg-surface-elevated px-2 py-2 text-sm text-text outline-none focus:border-accent">
                      <option value="">No course</option>
                      {courses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </label>
                )}

                <div className="grid grid-cols-2 gap-2">
                  <label className="text-xs text-text-muted">
                    Date
                    <input type="date" value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })}
                      className="mt-1 w-full rounded-lg border border-border bg-surface-elevated px-2 py-2 text-sm text-text outline-none focus:border-accent" />
                  </label>
                  <label className="text-xs text-text-muted">
                    Location
                    <input type="text" value={draft.location} placeholder="optional"
                      onChange={(e) => setDraft({ ...draft, location: e.target.value })}
                      className="mt-1 w-full rounded-lg border border-border bg-surface-elevated px-2 py-2 text-sm text-text outline-none focus:border-accent placeholder:text-text-muted/50" />
                  </label>
                </div>

                {draft.kind === "HOLIDAY" ? (
                  <p className="text-[11px] text-text-muted/80">A holiday runs the whole day, so it needs no times.</p>
                ) : (
                  <div className="grid grid-cols-3 gap-2">
                    <label className="text-xs text-text-muted">
                      All day
                      <input type="checkbox" checked={draft.allDay}
                        onChange={(e) => setDraft({ ...draft, allDay: e.target.checked })}
                        className="mt-2 block h-4 w-4 accent-[#7aa2f7]" />
                    </label>
                    <label className="text-xs text-text-muted">
                      From
                      <input type="time" disabled={draft.allDay} value={draft.startTime}
                        onChange={(e) => setDraft({ ...draft, startTime: e.target.value })}
                        className="mt-1 w-full rounded-lg border border-border bg-surface-elevated px-2 py-2 text-sm text-text outline-none focus:border-accent disabled:opacity-40" />
                    </label>
                    <label className="text-xs text-text-muted">
                      To
                      <input type="time" disabled={draft.allDay} value={draft.endTime}
                        onChange={(e) => setDraft({ ...draft, endTime: e.target.value })}
                        className="mt-1 w-full rounded-lg border border-border bg-surface-elevated px-2 py-2 text-sm text-text outline-none focus:border-accent disabled:opacity-40" />
                    </label>
                  </div>
                )}

                {draft.kind === "RESCHEDULED" && (
                  <div className="space-y-2 rounded-xl border border-border bg-surface-elevated p-3">
                    <p className="text-xs font-medium text-text">Which class is moving?</p>
                    {courses.length === 0 && (
                      <p className="text-[11px] text-text-muted/80">Add a course first.</p>
                    )}
                    <label className="block text-xs text-text-muted">
                      Course
                      <select value={draft.replacesCourseId}
                        onChange={(e) => {
                          const next = e.target.value;
                          const first = courseById.get(next)?.schedule[0];
                          setDraft({
                            ...draft,
                            replacesCourseId: next,
                            replacesDay: first?.dayOfWeek ?? draft.replacesDay,
                            replacesStart: first?.startTime ?? draft.replacesStart,
                            replacesEnd: first?.endTime ?? draft.replacesEnd,
                          });
                        }}
                        className="mt-1 w-full rounded-lg border border-border bg-surface px-2 py-2 text-sm text-text outline-none focus:border-accent">
                        <option value="">Choose a course</option>
                        {courses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    </label>
                    {slotsOfSource.length > 0 && (
                      <label className="block text-xs text-text-muted">
                        Class
                        <select
                          value={`${draft.replacesDay}|${draft.replacesStart}|${draft.replacesEnd}`}
                          onChange={(e) => {
                            const [d, st, en] = e.target.value.split("|");
                            setDraft({ ...draft, replacesDay: Number(d), replacesStart: st, replacesEnd: en });
                          }}
                          className="mt-1 w-full rounded-lg border border-border bg-surface px-2 py-2 text-sm text-text outline-none focus:border-accent">
                          {slotsOfSource.map((sl, i) => (
                            <option key={i} value={`${sl.dayOfWeek}|${sl.startTime}|${sl.endTime}`}>
                              {DAYS[sl.dayOfWeek]} {sl.startTime}–{sl.endTime}
                              {sl.type && sl.type !== "CLASS" ? ` · ${SLOT_KIND_META[sl.type].label}` : ""}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                    <p className="text-[11px] text-text-muted/80">
                      {course ? `${course.name} will be removed from ` : "The class will be removed from "}
                      {DAYS[draft.replacesDay]} {draft.replacesStart} and shown on {formatDayLabel(draft.date)}
                      {draft.allDay ? "" : ` at ${draft.startTime}`}.
                    </p>
                  </div>
                )}

                <label className="block text-xs text-text-muted">
                  Notes
                  <textarea rows={2} value={draft.notes} placeholder="optional"
                    onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-border bg-surface-elevated px-2 py-2 text-sm text-text outline-none focus:border-accent placeholder:text-text-muted/50" />
                </label>

                <div className="flex justify-between gap-2 pt-2">
                  <button
                    onClick={() => { setDraft(null); setEditingEntry(null); }}
                    className="rounded-lg px-3 py-2 text-sm text-text-muted transition-colors hover:bg-surface-elevated"
                  >
                    Cancel
                  </button>
                  <button onClick={() => void saveEntry()} disabled={saving}
                    className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50">
                    {saving ? "Saving…" : editingEntry ? "Save" : "Add entry"}
                  </button>
                </div>
              </div>
            </div>
          );
        })()}

        {/* Slot editor modal */}
        {editingSlot && (() => {
          const course = courses.find((c) => c.id === editingSlot.courseId);
          if (!course) return null;
          return (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setEditingSlot(null)}>
              <div className="w-full max-w-sm space-y-3 rounded-2xl border border-border bg-surface p-5" onClick={(e) => e.stopPropagation()}>
                <h3 className="text-base font-semibold text-text">
                  Edit class time · <span style={{ color: distinctColor(course.id) }}>{course.name}</span>
                </h3>
                {saving && <p className="text-sm text-text-muted">Saving…</p>}
                <div className="grid grid-cols-3 gap-2">
                  <label className="text-xs text-text-muted">
                    Day
                    <select value={editingSlot.dayOfWeek} onChange={(e) => setEditingSlot({ ...editingSlot, dayOfWeek: Number(e.target.value) })}
                      className="mt-1 w-full rounded-lg border border-border bg-surface-elevated px-2 py-2 text-sm text-text outline-none focus:border-accent">
                      {DAYS.map((d, i) => <option key={i} value={i}>{d}</option>)}
                    </select>
                  </label>
                  <label className="text-xs text-text-muted">
                    From
                    <input type="time" value={editingSlot.startTime} onChange={(e) => setEditingSlot({ ...editingSlot, startTime: e.target.value })}
                      className="mt-1 w-full rounded-lg border border-border bg-surface-elevated px-2 py-2 text-sm text-text outline-none focus:border-accent" />
                  </label>
                  <label className="text-xs text-text-muted">
                    To
                    <input type="time" value={editingSlot.endTime} onChange={(e) => setEditingSlot({ ...editingSlot, endTime: e.target.value })}
                      className="mt-1 w-full rounded-lg border border-border bg-surface-elevated px-2 py-2 text-sm text-text outline-none focus:border-accent" />
                  </label>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <label className="text-xs text-text-muted">
                    Kind
                    <select value={editingSlot.type} onChange={(e) => setEditingSlot({ ...editingSlot, type: e.target.value as CourseSlotType })}
                      className="mt-1 w-full rounded-lg border border-border bg-surface-elevated px-2 py-2 text-sm text-text outline-none focus:border-accent">
                      {COURSE_SLOT_TYPES.map((t) => (
                        <option key={t} value={t}>{SLOT_KIND_META[t].label}</option>
                      ))}
                    </select>
                  </label>
                  <label className="text-xs text-text-muted">
                    Week
                    <input type="number" min={1} max={60} placeholder="every"
                      value={editingSlot.weekNumber ?? ""}
                      onChange={(e) => setEditingSlot({ ...editingSlot, weekNumber: e.target.value ? Number(e.target.value) : null })}
                      className="mt-1 w-full rounded-lg border border-border bg-surface-elevated px-2 py-2 text-sm text-text outline-none focus:border-accent placeholder:text-text-muted/50" />
                  </label>
                  <label className="text-xs text-text-muted">
                    Location
                    <input type="text" placeholder="optional" value={editingSlot.location}
                      onChange={(e) => setEditingSlot({ ...editingSlot, location: e.target.value })}
                      className="mt-1 w-full rounded-lg border border-border bg-surface-elevated px-2 py-2 text-sm text-text outline-none focus:border-accent placeholder:text-text-muted/50" />
                  </label>
                </div>
                {editingSlot.type !== "CLASS" && (
                  <p className="text-[11px] text-text-muted/70">
                    {SLOT_KIND_META[editingSlot.type].label} slots do not count towards attendance.
                  </p>
                )}
                <div className="flex justify-between gap-2 pt-2">
                  <button onClick={() => void deleteSlot()}
                    className="rounded-lg px-3 py-2 text-sm text-danger transition-colors hover:bg-surface-elevated">
                    Remove
                  </button>
                  <div className="flex gap-2">
                    <button onClick={() => setEditingSlot(null)}
                      className="rounded-lg px-4 py-2 text-sm text-text-muted transition-colors hover:bg-surface-elevated">Cancel</button>
                    <button onClick={() => void saveSlotEdit()} disabled={saving}
                      className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50">
                      Save
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })()}
      </div>
    </AppShell>
  );
}