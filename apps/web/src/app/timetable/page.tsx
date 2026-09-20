"use client";

import { useState, useEffect, useMemo } from "react";
import type { Course, CourseScheduleSlot, UpdateCourseRequest } from "@prodapp/shared-types";
import { api } from "@/lib/api";
import { DAYS, timeToMinutes, COURSE_PALETTE } from "@/lib/timetable";
import { AppShell } from "@/components/AppShell";
import { Reveal } from "@/components/Reveal";
import { ScreenshotImport } from "@/components/timetable/ScreenshotImport";
import { UploadIcon } from "@/components/icons";

interface SlotEditorState {
  courseId: string;
  index: number;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
}

export default function TimetablePage() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [showImport, setShowImport] = useState(false);
  const [editingSlot, setEditingSlot] = useState<SlotEditorState | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // "Add class time" form state
  const [addCourseId, setAddCourseId] = useState("");
  const [addDay, setAddDay] = useState(1);
  const [addStart, setAddStart] = useState("09:00");
  const [addEnd, setAddEnd] = useState("10:30");

  const load = async () => {
    const res = await api.get<Course[]>("/api/courses");
    if ("ok" in res && res.ok) setCourses(res.data);
    setLoading(false);
  };

  useEffect(() => { void load(); }, []);

  useEffect(() => {
    if (courses.length > 0 && !courses.some((c) => c.id === addCourseId)) {
      setAddCourseId(courses[0].id);
    }
  }, [courses, addCourseId]);

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
    const slot: CourseScheduleSlot = { dayOfWeek: addDay, startTime: addStart, endTime: addEnd };
    if (timeToMinutes(addEnd) <= timeToMinutes(addStart)) {
      setError("End time must be after the start time.");
      return;
    }
    const dup = course.schedule.some(
      (s) => s.dayOfWeek === slot.dayOfWeek && s.startTime === slot.startTime && s.endTime === slot.endTime,
    );
    if (dup) { setError("That class time already exists."); return; }
    await updateSchedule(course.id, [...course.schedule, slot]);
  };

  const saveSlotEdit = async () => {
    if (!editingSlot) return;
    const course = courses.find((c) => c.id === editingSlot.courseId);
    if (!course) return;
    const next = [...course.schedule];
    next[editingSlot.index] = {
      dayOfWeek: editingSlot.dayOfWeek,
      startTime: editingSlot.startTime,
      endTime: editingSlot.endTime,
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

  // ---------- Weekly grid ----------

  const allSlots = useMemo(() => {
    const list: { course: Course; slot: CourseScheduleSlot; index: number }[] = [];
    for (const c of courses) {
      c.schedule.forEach((slot, index) => list.push({ course: c, slot, index }));
    }
    return list;
  }, [courses]);

  // Vertical scale (px per hour). Blocks sit at their real time so free periods
  // (e.g. 11:00–11:30, 13:30–14:30) stay visibly empty.
  const HOUR_PX = 64;

  const gridRange = useMemo(() => {
    let min = 9 * 60;
    let max = 17 * 60;
    for (const { slot } of allSlots) {
      min = Math.min(min, timeToMinutes(slot.startTime));
      max = Math.max(max, timeToMinutes(slot.endTime));
    }
    min = Math.floor(min / 60) * 60;
    max = Math.ceil(max / 60) * 60;
    if (max - min < 4 * 60) max = max + 60;
    return { min, max };
  }, [allSlots]);

  const columnHeight = ((gridRange.max - gridRange.min) / 60) * HOUR_PX;

  // Group slots by weekday, ordered by start time. Colour-coded subject blocks
  // only — no time text on the grid.
  const perDaySlots = useMemo(() => {
    const days: (typeof allSlots)[number][][] = Array.from({ length: 7 }, () => []);
    for (const item of allSlots) {
      const dow = item.slot.dayOfWeek;
      if (dow >= 0 && dow < 7) days[dow].push(item);
    }
    for (const d of days) d.sort((a, b) => timeToMinutes(a.slot.startTime) - timeToMinutes(b.slot.startTime));
    return days;
  }, [allSlots]);

  // Assign a unique palette colour to every course so no two subjects share a
  // colour (modulo palette overflow which is unlikely for a real timetable).
  const distinctColor = useMemo(() => {
    const map = new Map<string, string>();
    [...courses]
      .sort((a, b) => a.id.localeCompare(b.id))
      .forEach((c, i) => map.set(c.id, COURSE_PALETTE[i % COURSE_PALETTE.length]));
    return (id: string) => map.get(id) ?? COURSE_PALETTE[0];
  }, [courses]);

  const totals: { course: Course; slot: CourseScheduleSlot }[] = allSlots.map((s) => ({ course: s.course, slot: s.slot }));

  return (
    <AppShell>
      <div className="space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Timetable</h1>
            <p className="mt-1 text-sm text-text-muted">
              {loading ? "Loading…" : `${allSlots.length} weekly class${allSlots.length !== 1 ? "es" : ""} across ${courses.length} course${courses.length !== 1 ? "s" : ""}`}
            </p>
          </div>
          <div className="flex gap-2">
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
                    <select value={addCourseId} onChange={(e) => setAddCourseId(e.target.value)}
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
                  <button onClick={() => void addSlot()} disabled={saving}
                    className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50">
                    {saving ? "…" : "Add"}
                  </button>
                </div>
              </section>
            </Reveal>

            {/* Weekly grid */}
            <div className="overflow-x-auto">
              <div className="min-w-[640px]">
                <div className="grid grid-cols-7 gap-2">
                  {DAYS.map((d) => (
                    <div key={d} className="px-1 py-1 text-center text-[10px] font-medium uppercase tracking-wider text-text-muted">
                      {d}
                    </div>
                  ))}
                  {perDaySlots.map((items, dow) => (
                    <div key={dow} className="relative rounded-xl border border-border bg-surface" style={{ height: columnHeight }}>
                      {items.length === 0 && (
                        <div className="absolute inset-0 flex items-center justify-center text-[10px] text-text-muted/40">
                          —
                        </div>
                      )}
                      {items.map(({ course, slot, index }) => {
                        const color = distinctColor(course.id);
                        const top = ((timeToMinutes(slot.startTime) - gridRange.min) / 60) * HOUR_PX + 3;
                        const height = Math.max(22, ((timeToMinutes(slot.endTime) - timeToMinutes(slot.startTime)) / 60) * HOUR_PX - 6);
                        return (
                          <button
                            key={`${course.id}-${index}`}
                            onClick={() => setEditingSlot({
                              courseId: course.id,
                              index,
                              dayOfWeek: slot.dayOfWeek,
                              startTime: slot.startTime,
                              endTime: slot.endTime,
                            })}
                            title={`${course.name} · ${DAYS[slot.dayOfWeek]} ${slot.startTime}–${slot.endTime}`}
                            className="absolute left-1 right-1 z-10 overflow-hidden rounded-lg px-2.5 text-left text-[13px] font-semibold leading-tight text-[#0b0e14] transition-transform hover:z-20 hover:scale-[1.02]"
                            style={{ top, height, backgroundColor: color }}
                          >
                            <span className="block truncate">{course.name}</span>
                          </button>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Every class belongs to one course */}
            {totals.length > 0 && (
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
                        {c.schedule.map((s, i) => (
                          <span key={i} className="rounded bg-surface-elevated px-1.5 py-0.5 text-[10px] text-text-muted">
                            {DAYS[s.dayOfWeek]} {s.startTime}–{s.endTime}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </>
        )}

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