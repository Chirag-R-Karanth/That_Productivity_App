import type { CourseScheduleSlot } from "@prodapp/shared-types";

export const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export const COURSE_PALETTE = ["#8fb0ff", "#5ce09e", "#f0a6a6", "#b3a6ff", "#ffd08f", "#82d8e6", "#ff9f7a", "#9be08f"];

/** Stable per-course color so a class is recognisable across pages. */
export function courseColor(courseId: string): string {
  let h = 0;
  for (const ch of courseId) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return COURSE_PALETTE[h % COURSE_PALETTE.length];
}

export function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

export function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export interface ParsedSlot {
  courseName: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
}

const DAY_ALIASES: [number, string[]][] = [
  [1, ["monday", "mon"]],
  [2, ["tuesday", "tue", "tues"]],
  [3, ["wednesday", "wed"]],
  [4, ["thursday", "thu", "thur", "thurs"]],
  [5, ["friday", "fri"]],
  [6, ["saturday", "sat"]],
  [0, ["sunday", "sun"]],
];

function findDay(text: string): number | null {
  const lower = text.toLowerCase();
  for (const [dow, aliases] of DAY_ALIASES) {
    for (const a of aliases) {
      if (new RegExp(`\\b${a}\\b`).test(lower)) return dow;
    }
  }
  return null;
}

// "09:00 - 10:30", "9:00–10:30", "09.00 – 10.30", "9:00 to 10:30"
const TIME_RE = /(\d{1,2})\s*(?::|\.)\s*(\d{2})\s*(?:[-–—]|\bto\b)\s*(\d{1,2})\s*(?::|\.)\s*(\d{2})/i;

function textBefore(s: string, index: number): string {
  return s.slice(0, index);
}

function textAfter(s: string, index: number, length: number): string {
  return s.slice(index + length);
}

function cleanName(raw: string): string {
  let name = raw
    .replace(TIME_RE, " ")
    .replace(/\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)\b/gi, " ")
    .replace(/[\[\](){}_*|#]/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim()
    .replace(/^[\s\-–—:.,|/]+/, "")
    .replace(/[\s\-–—:.,|/]+$/, "")
    .trim();
  // Drop trailing room/level noise like "Room 412", "B-203", "3F"
  name = name.replace(/\s+(?:room|rm|hall|bldg|building|auditorium|lab|block|grp|group|sec|section)[.\s:]+\s*[0-9A-Za-z/ -]+$/i, "").trim();
  name = name.replace(/\s+[0-9]{1,4}$/, "").trim();
  return name;
}

/**
 * Turn raw OCR text into candidate timetable slots.
 *
 * Heuristic: lines containing only a day word set the "current day"; lines
 * containing a time range become a slot on that day, with the course name
 * inferred from whatever text is left over (before or after the times).
 */
export function parseOcrText(raw: string): ParsedSlot[] {
  if (!raw) return [];
  const lines = raw.split(/\r?\n/);
  const slots: ParsedSlot[] = [];
  let currentDay: number | null = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const day = findDay(trimmed);
    const timeMatch = trimmed.match(TIME_RE);

    if (!timeMatch) {
      if (day !== null) currentDay = day;
      continue;
    }
    if (currentDay === null) currentDay = 0; // Monday fallback, editable in review

    const [, sh, sm, eh, em] = timeMatch;
    const startH = Number(sh);
    const startM = Number(sm ?? 0);
    const endH = Number(eh);
    const endM = Number(em ?? 0);
    if (startH > 23 || endH > 23 || startM > 59 || endM > 59) continue;
    const startTotal = startH * 60 + startM;
    const endTotal = endH * 60 + endM;
    if (endTotal <= startTotal) continue;

    const idx = timeMatch.index ?? 0;
    const before = cleanName(textBefore(trimmed, idx));
    const after = cleanName(textAfter(trimmed, idx, timeMatch[0].length));
    const courseName = after.length >= before.length ? after : before;
    if (!courseName) continue;

    slots.push({
      courseName,
      dayOfWeek: currentDay,
      startTime: minutesToTime(startTotal),
      endTime: minutesToTime(endTotal),
    });
  }

  // Collapse exact duplicates (same course, day, times)
  const seen = new Set<string>();
  return slots.filter((s) => {
    const key = `${s.courseName.toLowerCase()}|${s.dayOfWeek}|${s.startTime}|${s.endTime}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Merge OCR entries into per-course schedules (one course per name). */
export function mergeEntriesToCourses(entries: ParsedSlot[]): {
  courseName: string;
  schedule: CourseScheduleSlot[];
}[] {
  const byName = new Map<string, CourseScheduleSlot[]>();
  for (const e of entries) {
    const key = e.courseName.trim();
    if (!key) continue;
    const list = byName.get(key) ?? [];
    const slot: CourseScheduleSlot = {
      dayOfWeek: e.dayOfWeek,
      startTime: e.startTime,
      endTime: e.endTime,
    };
    const dup = list.some(
      (s) => s.dayOfWeek === slot.dayOfWeek && s.startTime === slot.startTime && s.endTime === slot.endTime,
    );
    if (!dup) list.push(slot);
    byName.set(key, list);
  }
  return [...byName.entries()].map(([courseName, schedule]) => ({ courseName, schedule }));
}