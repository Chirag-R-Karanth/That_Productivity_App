"use client";

import { useEffect, useState } from "react";
import type { Capacity } from "@prodapp/shared-types";
import { clockShort, duration, verdictTone } from "@/lib/day";
import { wantsReducedMotion } from "@/lib/motion";

/**
 * The day as one bar.
 *
 * This is where the app stops describing the day and shows it. The bar is the
 * whole awake window; solid regions are time the day has already promised to
 * someone else. The remaining region is genuinely usable time. Planned work is
 * drawn *inside* that region — and when the plan is larger than the space, the
 * overflow runs off the end of the bar instead of being quietly scaled to fit.
 *
 * A calendar would render an over-committed day identically to a comfortable
 * one. This does not.
 */
export function CapacityArc({ capacity }: { capacity: Capacity }) {
  const tone = verdictTone(capacity.verdict);
  const window = Math.max(1, capacity.windowEndMinutes - capacity.windowStartMinutes);
  const committedPct = (capacity.fixedMinutes / window) * 100;
  const freePct = (capacity.availableMinutes / window) * 100;
  const plannedWithinFree =
    capacity.plannedMinutes > 0
      ? Math.min(100, (capacity.plannedMinutes / Math.max(1, capacity.availableMinutes)) * 100)
      : 0;
  const overflow = Math.max(0, capacity.plannedMinutes - capacity.availableMinutes);
  const overflowPct = (overflow / window) * 100;

  return (
    <div>
      <div className="relative">
        {/* The whole window */}
        <div className="relative h-3 w-full overflow-hidden rounded-full bg-surface-elevated">
          {/* Committed to classes + events */}
          <ArcSegment
            pct={committedPct}
            tone="muted"
            title={`${duration(capacity.fixedMinutes)} committed across ${capacity.fixedCount} commitments`}
          />
          {/* Genuinely usable time */}
          <ArcSegment
            pct={freePct}
            tone={capacity.availableMinutes > 0 ? "free" : "none"}
            title={`${duration(capacity.availableMinutes)} usable`}
            className="bg-accent-soft"
          />
          {/* Planned work, filling the usable region from its left edge */}
          <ArcSegment
            pct={plannedWithinFree}
            tone={tone}
            title={`${duration(capacity.plannedMinutes)} planned`}
          />
        </div>

        {/* Overflow: drawn past the end, because the day does not contain it. */}
        {overflow > 0 && (
          <div
            className="pointer-events-none absolute top-0 h-3 overflow-hidden rounded-r-full bg-danger/70"
            style={{ left: "100%", width: `${Math.min(38, overflowPct * 2.6)}%` }}
            aria-hidden
          />
        )}
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-text-muted">
        <Legend tone="muted" label={`${duration(capacity.fixedMinutes)} committed`} />
        <Legend tone="free" label={`${duration(capacity.availableMinutes)} usable`} />
        {capacity.plannedMinutes > 0 && (
          <Legend
            tone={tone}
            label={`${duration(capacity.plannedMinutes)} planned`}
          />
        )}
        {overflow > 0 && (
          <Legend tone="alert" label={`${duration(overflow)} over`} />
        )}
        <span className="ml-auto tabular-nums opacity-70">
          {clockShort(capacity.windowStartMinutes)} – {clockShort(capacity.windowEndMinutes)}
        </span>
      </div>
    </div>
  );
}

function ArcSegment({
  pct,
  tone,
  title,
  className = "",
}: {
  pct: number;
  tone: "muted" | "free" | "none" | "calm" | "good" | "warn" | "alert";
  title: string;
  className?: string;
}) {
  const [shown, setShown] = useState(0);

  // Grow to the real value on mount so capacity arrives rather than appearing.
  useEffect(() => {
    if (wantsReducedMotion()) {
      setShown(pct);
      return;
    }
    const t = setTimeout(() => setShown(pct), 60);
    return () => clearTimeout(t);
  }, [pct]);

  const fill: Record<string, string> = {
    muted: "bg-border",
    free: "",
    none: "bg-transparent",
    calm: "bg-focus/70",
    good: "bg-accent/80",
    warn: "bg-warning/80",
    alert: "bg-danger/80",
  };

  return (
    <div
      className={`absolute inset-y-0 left-0 ${fill[tone] ?? ""} ${className}`}
      style={{
        width: `${Math.max(0, Math.min(100, shown))}%`,
        transition: wantsReducedMotion() ? "none" : "width 700ms cubic-bezier(0.22, 1, 0.36, 1)",
      }}
      title={title}
    />
  );
}

function Legend({ tone, label }: { tone: string; label: string }) {
  const dot: Record<string, string> = {
    muted: "bg-border",
    free: "bg-accent-soft ring-1 ring-accent/40",
    calm: "bg-focus/70",
    good: "bg-accent/80",
    warn: "bg-warning/80",
    alert: "bg-danger/80",
  };
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`h-2 w-2 rounded-full ${dot[tone] ?? "bg-border"}`} />
      {label}
    </span>
  );
}
