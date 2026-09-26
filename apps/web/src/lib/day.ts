import type { CapacityVerdict, DayPhase, TimelineBlock } from "@prodapp/shared-types";

export function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function clockOf(minutes: number): string {
  const m = Math.max(0, Math.min(24 * 60, Math.round(minutes)));
  const h = Math.floor(m / 60);
  const mm = m % 60;
  const suffix = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(mm).padStart(2, "0")} ${suffix}`;
}

export function clockShort(minutes: number): string {
  const m = Math.max(0, Math.min(24 * 60, Math.round(minutes)));
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

/** "3h 40m" — the unit people actually think in, never "220 min". */
export function duration(minutes: number): string {
  const total = Math.max(0, Math.round(minutes));
  if (total < 60) return `${total}m`;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

export function minutesNow(d: Date): number {
  return d.getHours() * 60 + d.getMinutes();
}

/** A copy of the timeline with `isNow` recomputed against the live clock. */
export function refreshNow(blocks: TimelineBlock[], nowMinutes: number, isToday: boolean): TimelineBlock[] {
  if (!isToday) return blocks.map((b) => ({ ...b, isNow: false }));
  return blocks.map((b) => {
    if (b.startMinutes === null || b.endMinutes === null) return b;
    const isNow = nowMinutes >= b.startMinutes && nowMinutes < b.endMinutes;
    if (isNow === b.isNow) return b;
    return { ...b, isNow, isPast: nowMinutes >= b.endMinutes };
  });
}

const PHASE_COPY: Record<DayPhase, { line: string; note: string }> = {
  dawn: { line: "Early hours", note: "The day has not started yet." },
  morning: { line: "Morning", note: "The part of the day that gives the most back." },
  midday: { line: "Midday", note: "Half the day is already spoken for." },
  afternoon: { line: "Afternoon", note: "The working stretch is narrowing." },
  evening: { line: "Evening", note: "What is left should be worth staying up for." },
  night: { line: "Late", note: "Nothing scheduled. This is fine." },
};

export function phaseCopy(phase: DayPhase): { line: string; note: string } {
  return PHASE_COPY[phase];
}

export type VerdictTone = "calm" | "good" | "warn" | "alert";

export function verdictTone(verdict: CapacityVerdict): VerdictTone {
  switch (verdict) {
    case "open":
    case "light":
      return "calm";
    case "balanced":
      return "good";
    case "tight":
      return "warn";
    case "over":
      return "alert";
  }
}

const KIND_LABEL: Record<TimelineBlock["kind"], string> = {
  class: "Class",
  event: "Event",
  focus: "Focus",
  plan: "Planned",
  deadline: "Due",
  gap: "Free",
};

export function kindLabel(kind: TimelineBlock["kind"]): string {
  return KIND_LABEL[kind];
}

/**
 * Order work by what should be done next rather than by whatever the database
 * happened to return: highest importance first, then soonest deadline, then
 * shortest job — because finishing one thing is worth more than starting three.
 */
const PRIORITY_RANK: Record<string, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };

export function nextUp<T extends {
  completed: boolean;
  priority: string;
  dueDate?: string | null;
  estimateMinutes?: number | null;
}>(tasks: T[]): T | null {
  const open = tasks.filter((t) => !t.completed);
  if (open.length === 0) return null;
  return [...open].sort((a, b) => {
    const p = (PRIORITY_RANK[a.priority] ?? 1) - (PRIORITY_RANK[b.priority] ?? 1);
    if (p !== 0) return p;
    const ad = a.dueDate ?? "9999-12-31";
    const bd = b.dueDate ?? "9999-12-31";
    if (ad !== bd) return ad < bd ? -1 : 1;
    return (a.estimateMinutes ?? 9999) - (b.estimateMinutes ?? 9999);
  })[0];
}
