"use client";

import { useEffect, useRef } from "react";
import { duration } from "@/lib/day";
import { wantsReducedMotion } from "@/lib/motion";

/**
 * Focus by hour of day.
 *
 * Drawn rather than tabulated because the shape is the finding: a single tall
 * cluster in the morning and a flat evening is information at a glance that a
 * row of numbers actively hides. Hour 0 is on the left so the chart reads as a
 * day, with the working day bracketed.
 */
export function RhythmChart({ data }: { data: { hour: number; minutes: number }[] }) {
  const ref = useRef<SVGSVGElement>(null);
  const peak = Math.max(1, ...data.map((d) => d.minutes));

  // Bars grow from the baseline once, so the chart assembles rather than blinks.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const bars = Array.from(el.querySelectorAll<SVGRectElement>("rect[data-bar]"));
    if (bars.length === 0) return;
    if (wantsReducedMotion()) {
      bars.forEach((b) => b.setAttribute("height", b.dataset.h ?? "0"));
      return;
    }
    bars.forEach((b, i) => {
      const h = b.dataset.h ?? "0";
      b.style.transformOrigin = "bottom";
      b.animate(
        [{ transform: "scaleY(0)" }, { transform: `scaleY(${h ? 1 : 0})` }],
        { duration: 520, delay: i * 14, easing: "cubic-bezier(0.22,1,0.36,1)", fill: "backwards" },
      );
    });
  }, [data]);

  const W = 100;
  const H = 34;
  const step = W / 24;
  const barW = step * 0.52;
  const total = data.reduce((a, d) => a + d.minutes, 0);

  return (
    <figure className="m-0">
      <svg
        ref={ref}
        viewBox={`0 0 ${W} ${H + 4}`}
        preserveAspectRatio="none"
        className="h-28 w-full"
        role="img"
        aria-label={`Focus time by hour of day. Total ${duration(total)}.`}
      >
        {/* The hours most people are awake, kept legible against the empty night. */}
        {[7, 12, 17, 22].map((h) => (
          <line
            key={h}
            x1={h * step}
            x2={h * step}
            y1={0}
            y2={H}
            stroke="var(--t-border)"
            strokeWidth={0.15}
            strokeDasharray="0.6 0.8"
            vectorEffect="non-scaling-stroke"
          />
        ))}
        {data.map((d) => {
          const h = (d.minutes / peak) * (H - 2);
          return (
            <rect
              key={d.hour}
              data-bar
              data-h={h > 0 ? "1" : "0"}
              x={d.hour * step + (step - barW) / 2}
              y={H - h}
              width={barW}
              height={Math.max(h, d.minutes > 0 ? 0.5 : 0)}
              rx={0.4}
              fill={d.minutes >= peak * 0.5 && d.minutes > 0 ? "var(--t-accent)" : "var(--t-focus)"}
              opacity={d.minutes > 0 ? 0.85 : 0.18}
            >
              <title>{`${String(d.hour).padStart(2, "0")}:00 — ${d.minutes} min`}</title>
            </rect>
          );
        })}
        <line x1={0} x2={W} y1={H} y2={H} stroke="var(--t-border)" strokeWidth={0.2} vectorEffect="non-scaling-stroke" />
      </svg>
      <figcaption className="mt-1 flex justify-between text-[10px] tabular-nums text-text-muted/70">
        <span>00</span>
        <span>06</span>
        <span>12</span>
        <span>18</span>
        <span>24</span>
      </figcaption>
    </figure>
  );
}

/**
 * Planned against usable time, day by day.
 *
 * Two bars per day: what the day could have held, and what was planned for it.
 * Where the planned bar overshoots, the day is marked — the same over-capacity
 * verdict the Today screen gives, shown historically so a pattern of
 * over-committing becomes visible as a shape rather than a feeling.
 */
export function PlannedVsAvailable({
  days,
}: {
  days: { date: string; plannedMinutes: number; availableMinutes: number; focusMinutes: number }[];
}) {
  const peak = Math.max(60, ...days.map((d) => Math.max(d.availableMinutes, d.plannedMinutes)));

  return (
    <div className="space-y-2.5">
      {days.map((d) => {
        const over = d.plannedMinutes > d.availableMinutes;
        const availW = (d.availableMinutes / peak) * 100;
        const planW = (Math.min(d.plannedMinutes, peak) / peak) * 100;
        const day = new Date(`${d.date}T00:00:00`);
        const dow = day.toLocaleDateString(undefined, { weekday: "short" });
        const dom = day.getDate();

        return (
          <div key={d.date} className="flex items-center gap-3">
            <div className="w-9 shrink-0 text-right">
              <span className="block text-[11px] font-medium text-text">{dow}</span>
              <span className="block text-[10px] tabular-nums text-text-muted/60">{dom}</span>
            </div>

            <div className="min-w-0 flex-1 space-y-1">
              {/* Usable time */}
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-elevated">
                <div
                  className="h-full rounded-full bg-border transition-[width] duration-700 ease-out"
                  style={{ width: `${availW}%` }}
                />
              </div>
              {/* Planned work — drawn over it so overshoot is visible */}
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-elevated">
                <div
                  className={`h-full rounded-full transition-[width] duration-700 ease-out ${
                    over ? "bg-danger/80" : "bg-accent/75"
                  }`}
                  style={{ width: `${planW}%` }}
                />
              </div>
            </div>

            <div className="w-24 shrink-0 text-right text-[10.5px] tabular-nums text-text-muted">
              {d.plannedMinutes > 0 ? (
                <>
                  {duration(d.plannedMinutes)}
                  {over && <span className="ml-1 text-danger">over</span>}
                </>
              ) : (
                <span className="opacity-50">—</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Estimate against reality, per course.
 *
 * The bar is centred on "even": work that overruns extends right, work that
 * finishes early extends left. Anything past 2× is drawn clamped, because the
 * point is that it is badly wrong, not by how badly.
 */
export function AccuracyChart({
  accuracy,
}: {
  accuracy: { courseId: string; courseName: string; estimatedMinutes: number; actualMinutes: number; ratio: number; samples: number }[];
}) {
  if (accuracy.length === 0) return null;
  const SCALE = 2; // ratio at the edge of the track

  return (
    <div className="space-y-3">
      {accuracy.map((a) => {
        const clamped = Math.min(a.ratio, SCALE);
        const off = ((clamped - 1) / (SCALE - 1)) * 50; // % from centre
        const overruns = a.ratio > 1.25;
        const underruns = a.ratio < 0.8;

        return (
          <div key={a.courseId}>
            <div className="flex items-baseline justify-between gap-3">
              <span className="truncate text-[12.5px] text-text">{a.courseName}</span>
              <span
                className={`shrink-0 text-[11px] tabular-nums ${
                  overruns ? "text-warning" : underruns ? "text-focus" : "text-text-muted"
                }`}
              >
                {a.ratio.toFixed(1)}×
                <span className="ml-1 opacity-60">n={a.samples}</span>
              </span>
            </div>
            <div className="relative mt-1 h-1.5 rounded-full bg-surface-elevated">
              {/* the "as estimated" centre line */}
              <span className="absolute left-1/2 top-1/2 h-2.5 w-px -translate-x-1/2 -translate-y-1/2 bg-border" />
              <span
                className={`absolute top-0 h-1.5 rounded-full transition-all duration-700 ease-out ${
                  overruns ? "bg-warning/80" : "bg-focus/70"
                }`}
                style={
                  a.ratio >= 1
                    ? { left: "50%", width: `${off}%` }
                    : { right: "50%", width: `${Math.abs(off)}%` }
                }
              />
            </div>
            <p className="mt-0.5 text-[10.5px] tabular-nums text-text-muted/70">
              estimated {duration(a.estimatedMinutes)} · actual {duration(a.actualMinutes)}
            </p>
          </div>
        );
      })}
    </div>
  );
}
