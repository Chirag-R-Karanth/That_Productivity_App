"use client";

import { useEffect, useRef } from "react";
import type { FreeBlock, TimelineBlock } from "@prodapp/shared-types";
import { clockOf, clockShort, duration, kindLabel } from "@/lib/day";
import { wantsReducedMotion } from "@/lib/motion";

/** Vertical pixels per minute. Tuned so a 16h day is a comfortable scroll. */
const PX_PER_MIN = 0.62;
const MIN_BLOCK_PX = 26;

interface Props {
  blocks: TimelineBlock[];
  free: FreeBlock[];
  windowStart: number;
  windowEnd: number;
  nowMinutes: number;
  isToday: boolean;
  onActivate?: (block: TimelineBlock) => void;
}

/**
 * The day, to scale.
 *
 * Every commitment shares one rail and its height is proportional to its real
 * duration, so a one-hour lecture and a four-hour lab block look like the
 * different things they are. Free time is drawn as space rather than left as a
 * gap — an empty row reads as "nothing here", whereas a labelled stretch of
 * daylight reads as "this is yours to fill".
 *
 * The current moment is a physical position on that rail, and the rail is
 * scrolled so the moment stays in view as the day moves.
 */
export function DayTimeline({
  blocks,
  free,
  windowStart,
  windowEnd,
  nowMinutes,
  isToday,
  onActivate,
}: Props) {
  const railRef = useRef<HTMLDivElement>(null);
  const didInitialScroll = useRef(false);

  const span = Math.max(60, windowEnd - windowStart);
  const y = (minutes: number) => (minutes - windowStart) * PX_PER_MIN;

  // Keep the current moment in view, but only after the first paint — hijacking
  // the scroll position on load is disorienting.
  useEffect(() => {
    if (!isToday) return;
    const el = railRef.current;
    if (!el) return;

    if (!didInitialScroll.current) {
      didInitialScroll.current = true;
      const target = y(nowMinutes) - el.clientHeight * 0.35;
      el.scrollTop = Math.max(0, target);
      return;
    }
    const target = y(nowMinutes) - el.clientHeight * 0.35;
    el.scrollTo({ top: Math.max(0, target), behavior: wantsReducedMotion() ? "auto" : "smooth" });
    // Only react to the minute changing, not to every block refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Math.floor(nowMinutes), isToday]);

  const placed = blocks.filter(
    (b) => b.startMinutes !== null && b.endMinutes !== null && b.kind !== "plan" && b.kind !== "deadline",
  );

  const nowTop = isToday ? y(nowMinutes) : -1;
  const showNow = isToday && nowMinutes >= windowStart && nowMinutes <= windowEnd;

  return (
    <div className="relative">
      <div
        ref={railRef}
        className="timeline-scroll relative max-h-[62vh] overflow-y-auto overscroll-contain pr-2"
        style={{ height: Math.max(360, span * PX_PER_MIN) }}
      >
        <div className="relative" style={{ height: span * PX_PER_MIN }}>
          {/* Hour guides — the ruler the day is read against */}
          {hourMarks(windowStart, windowEnd).map((m) => (
            <div
              key={m}
              className="pointer-events-none absolute left-0 right-0 flex items-center gap-2"
              style={{ top: y(m) }}
            >
              <span className="w-11 shrink-0 text-right text-[10px] tabular-nums text-text-muted/60">
                {clockShort(m)}
              </span>
              <span className="h-px flex-1 bg-border/50" />
            </div>
          ))}

          {/* Free space — labelled, because it is the point of the view */}
          {free.map((f) => {
            const h = Math.max(MIN_BLOCK_PX, (f.durationMinutes) * PX_PER_MIN);
            return (
              <div
                key={`free-${f.startMinutes}`}
                className="absolute left-[3.25rem] right-0 flex items-center rounded-lg border border-dashed border-border/70 px-3"
                style={{ top: y(f.startMinutes) + 1, height: h - 2 }}
              >
                <p className="truncate text-[11px] text-text-muted">
                  <span className="tabular-nums opacity-70">
                    {clockShort(f.startMinutes)}–{clockShort(f.endMinutes)}
                  </span>
                  <span className="mx-1.5 opacity-40">·</span>
                  {duration(f.durationMinutes)} free
                </p>
              </div>
            );
          })}

          {/* Commitments */}
          {placed.map((b) => {
            const start = b.startMinutes as number;
            const end = b.endMinutes as number;
            const h = Math.max(MIN_BLOCK_PX, (end - start) * PX_PER_MIN);
            return (
              <TimelineRow
                key={b.key}
                block={b}
                top={y(start)}
                height={h}
                onActivate={onActivate}
              />
            );
          })}

          {/* The moment itself */}
          {showNow && <NowLine top={nowTop} label={clockOf(nowMinutes)} />}
        </div>
      </div>
    </div>
  );
}

function hourMarks(start: number, end: number): number[] {
  const out: number[] = [];
  const first = Math.ceil(start / 60) * 60;
  for (let m = first; m <= end; m += 60) out.push(m);
  return out;
}

function NowLine({ top, label }: { top: number; label: string }) {
  const dotRef = useRef<HTMLSpanElement>(null);

  // A slow pulse so the present reads as alive without becoming a blinking
  // distraction. Suppressed entirely under reduced-motion.
  useEffect(() => {
    if (wantsReducedMotion()) return;
    const el = dotRef.current;
    if (!el) return;
    let raf = 0;
    let start = 0;
    const tick = (t: number) => {
      if (!start) start = t;
      const p = ((t - start) % 3600) / 3600;
      const s = 1 + Math.sin(p * Math.PI * 2) * 0.18;
      el.style.transform = `scale(${s.toFixed(3)})`;
      el.style.opacity = String(0.75 + Math.sin(p * Math.PI * 2) * 0.25);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div
      className="pointer-events-none absolute left-0 right-0 z-20 flex items-center"
      style={{ top }}
      aria-hidden
    >
      <span className="w-11 shrink-0 text-right text-[10px] font-semibold tabular-nums text-accent">
        {label}
      </span>
      <span className="relative flex-1">
        <span className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-gradient-to-r from-accent/70 via-accent/30 to-transparent" />
        <span
          ref={dotRef}
          className="absolute left-0 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent shadow-[0_0_10px_var(--t-accent)]"
        />
      </span>
    </div>
  );
}

const KIND_ACCENT: Record<string, string> = {
  class: "var(--t-focus)",
  event: "var(--t-accent)",
  focus: "var(--t-success)",
};

function TimelineRow({
  block,
  top,
  height,
  onActivate,
}: {
  block: TimelineBlock;
  top: number;
  height: number;
  onActivate?: (b: TimelineBlock) => void;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const compact = height < 54;

  // Blocks settle into place rather than snapping in when the day model loads.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (wantsReducedMotion()) {
      el.style.opacity = "1";
      return;
    }
    const anim = el.animate(
      [
        { opacity: 0, transform: "translateY(6px)" },
        { opacity: 1, transform: "translateY(0)" },
      ],
      { duration: 420, delay: Math.min(240, top * 0.35), easing: "cubic-bezier(0.22,1,0.36,1)", fill: "backwards" },
    );
    return () => anim.cancel();
  }, [top]);

  const accent = block.color ?? KIND_ACCENT[block.kind] ?? "var(--t-accent)";
  const isFocus = block.kind === "focus";

  return (
    <button
      ref={ref}
      type="button"
      onClick={() => onActivate?.(block)}
      className={`group absolute left-[3.25rem] right-0 overflow-hidden rounded-lg border text-left transition-colors ${
        block.isNow
          ? "border-accent/60 bg-accent-soft/60"
          : isFocus
            ? "border-transparent bg-transparent hover:bg-surface-elevated/60"
            : "border-border bg-surface hover:bg-surface-elevated"
      }`}
      style={{ top, height, opacity: block.isPast && !block.isNow ? 0.55 : 1 }}
      aria-label={`${kindLabel(block.kind)}: ${block.title}`}
    >
      {/* The bar itself encodes the kind, so colour is never the only signal */}
      <span
        className="absolute inset-y-0 left-0 w-[3px] rounded-l-lg"
        style={{ backgroundColor: accent, opacity: block.isPast ? 0.4 : 0.95 }}
      />
      <span className={`flex h-full flex-col justify-center pl-3.5 pr-2 ${compact ? "py-0" : "py-1.5"}`}>
        <span className="flex items-baseline gap-2">
          <span
            className={`truncate ${compact ? "text-[12px]" : "text-[13px]"} ${
              block.isNow ? "font-medium text-accent" : "text-text"
            }`}
          >
            {block.title}
          </span>
          {block.isNow && (
            <span className="shrink-0 rounded-full bg-accent px-1.5 py-px text-[9px] font-semibold uppercase tracking-wide text-white">
              now
            </span>
          )}
        </span>
        {!compact && (
          <span className="mt-0.5 flex items-center gap-1.5 truncate text-[10.5px] text-text-muted">
            <span className="tabular-nums">
              {clockShort(block.startMinutes as number)}–{clockShort(block.endMinutes as number)}
            </span>
            {block.durationMinutes !== null && <span>· {duration(block.durationMinutes)}</span>}
            {block.meta && <span className="truncate opacity-80">· {block.meta}</span>}
          </span>
        )}
      </span>
    </button>
  );
}

export { clockOf, duration };
