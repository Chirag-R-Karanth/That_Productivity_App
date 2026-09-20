"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import type { Course, CreateCourseRequest, UpdateCourseRequest } from "@prodapp/shared-types";
import { api } from "@/lib/api";
import { AppShell } from "@/components/AppShell";
import { Reveal } from "@/components/Reveal";
import { TimetableIcon } from "@/components/icons";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

interface CourseFormProps {
  initial?: Course;
  onSaved: () => void;
  onCancel: () => void;
}

function CourseForm({ initial, onSaved, onCancel }: CourseFormProps) {
  const [name, setName] = useState(initial?.name ?? "");
  const [code, setCode] = useState(initial?.code ?? "");
  const [threshold, setThreshold] = useState(initial?.attendanceThreshold ?? 80);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const body = {
        name: name.trim(),
        code: code.trim() || null,
        attendanceThreshold: threshold,
        // Timetable slots are managed on the Timetable page; preserve what exists.
        schedule: initial?.schedule ?? [],
      } satisfies CreateCourseRequest | UpdateCourseRequest;
      if (initial) {
        await api.patch(`/api/courses/${initial.id}`, body as UpdateCourseRequest);
      } else {
        await api.post("/api/courses", body as CreateCourseRequest);
      }
      onSaved();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4 rounded-2xl border border-border bg-surface p-5">
      {error && <p className="text-sm text-danger">{error}</p>}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <label className="text-xs text-text-muted">
          Course name
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} required
            className="mt-1 w-full rounded-lg border border-border bg-surface-elevated px-3 py-2 text-sm text-text outline-none focus:border-accent" />
        </label>
        <label className="text-xs text-text-muted">
          Code (optional)
          <input value={code} onChange={(e) => setCode(e.target.value)}
            className="mt-1 w-full rounded-lg border border-border bg-surface-elevated px-3 py-2 text-sm text-text outline-none focus:border-accent" />
        </label>
        <label className="text-xs text-text-muted">
          Attendance threshold %
          <input type="number" min={0} max={100} value={threshold} onChange={(e) => setThreshold(+e.target.value)}
            className="mt-1 w-full rounded-lg border border-border bg-surface-elevated px-3 py-2 text-sm text-text outline-none focus:border-accent" />
        </label>
      </div>

      <p className="text-xs text-text-muted">
        Set the weekly class times for this course on the{" "}
        <Link href="/timetable" className="font-medium text-accent hover:text-accent-hover">timetable</Link> page
        {" — a course can meet several times a week and still be one course."}
      </p>

      <div className="flex justify-end gap-2 pt-1">
        <button type="button" onClick={onCancel}
          className="rounded-lg px-4 py-2 text-sm text-text-muted transition-colors hover:bg-surface-elevated">Cancel</button>
        <button type="submit" disabled={saving}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50">
          {saving ? "…" : initial ? "Save" : "Add course"}
        </button>
      </div>
    </form>
  );
}

export default function CoursesPage() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<string | null>(null); // course id
  const [showForm, setShowForm] = useState(false);

  const load = async () => {
    const res = await api.get<Course[]>("/api/courses");
    if ("ok" in res && res.ok) setCourses(res.data);
    setLoading(false);
  };

  useEffect(() => { void load(); }, []);

  const deleteCourse = async (id: string) => {
    if (!confirm("Delete this course?")) return;
    await api.delete(`/api/courses/${id}`);
    setCourses((prev) => prev.filter((c) => c.id !== id));
  };

  return (
    <AppShell>
      <div className="space-y-6">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Courses</h1>
            <p className="mt-1 text-sm text-text-muted">
              {loading ? "Loading…" : `${courses.length} course${courses.length !== 1 ? "s" : ""}`}
            </p>
          </div>
          {!showForm && (
            <button onClick={() => setShowForm(true)}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover">
              Add course
            </button>
          )}
        </header>

        {showForm && (
          <Reveal delay={0}>
            <CourseForm onSaved={() => { setShowForm(false); void load(); }} onCancel={() => setShowForm(false)} />
          </Reveal>
        )}

        {courses.map((course, idx) =>
          editing === course.id ? (
            <CourseForm key={course.id} initial={course} onSaved={() => { setEditing(null); void load(); }} onCancel={() => setEditing(null)} />
          ) : (
            <Reveal key={course.id} delay={idx * 50}>
              <div className="group rounded-2xl border border-border bg-surface p-5 transition-colors hover:border-[#333a48]">
                <div className="flex items-start justify-between">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h2 className="text-sm font-semibold text-text">{course.name}</h2>
                      {course.code && <span className="rounded bg-[#1a2440] px-1.5 py-0.5 text-[10px] text-[#8fb0ff]">{course.code}</span>}
                    </div>
                    <p className="mt-1 text-xs text-text-muted">
                      Threshold: {course.attendanceThreshold}% · {course.schedule.length} slot{course.schedule.length !== 1 ? "s" : ""}
                    </p>
                    {course.schedule.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {course.schedule.map((s, i) => (
                          <span key={i} className="rounded bg-surface-elevated px-1.5 py-0.5 text-[10px] text-text-muted">
                            {DAYS[s.dayOfWeek]} {s.startTime}–{s.endTime}
                          </span>
                        ))}
                      </div>
                    )}
                    <Link href="/timetable"
                      className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-accent transition-colors hover:text-accent-hover">
                      <TimetableIcon className="h-3.5 w-3.5" />
                      Open weekly timetable
                    </Link>
                  </div>
                  <div className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                    <button onClick={() => setEditing(course.id)}
                      className="rounded px-2 py-1 text-xs text-text-muted hover:bg-surface-elevated hover:text-text">Edit</button>
                    <button onClick={() => void deleteCourse(course.id)}
                      className="rounded px-2 py-1 text-xs text-danger hover:bg-surface-elevated">Delete</button>
                  </div>
                </div>
              </div>
            </Reveal>
          ),
        )}

        {!loading && courses.length === 0 && (
          <div className="rounded-2xl border border-dashed border-border py-16 text-center">
            <p className="text-sm text-text-muted">No courses yet. Add one to enable attendance tracking.</p>
          </div>
        )}
      </div>
    </AppShell>
  );
}