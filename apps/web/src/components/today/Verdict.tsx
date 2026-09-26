"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { Capacity, DayPhase } from "@prodapp/shared-types";
import { clockOf, duration, phaseCopy, verdictTone } from "@/lib/day";
import { FocusIcon, ArrowRightIcon } from "@/components/icons";
import { wantsReducedMotion } from "@/lib/motion";

const TONE_TEXT: Record<string, string> = {
  calm: "text-focus",
  good: "text-accent",
  warn: "text-warning",
  alert: "text-danger",
};

const TONE_GLOW: Record<string, string> = {
  calm: "glow-calm",
  good: "glow-good",
  warn: "glow-warn",
  alert: "glow-alert",
};

interface Props {
  capacity: Capacity;
  phase: DayPhase;
  now: Date;
  name: string;
  focusMinutes: number;
  onStartFocus?: () => void;
}

/**
 * The answer, before anything else.
 *
 * The brief's central question is "what do I need to do, and what actually
 * matters right now?", so this is the only thing on the page that speaks in
 * sentences. It states the day's arithmetic plainly — committed, usable,
 * planned — and when the day does not fit, it says so in those words rather
 * than leaving the user to infer it from a chart.
 */
export function Verdict({
  capacity,
  phase,
  now,
  name,
  focusMinutes,
  onStartFocus,
}: Props) {
  const tone = verdictTone(capacity.verdict);
  const greeting = greetingFor(now);
  const copy = phaseCopy(phase);

  return (
    <header className={`hero-${phase} relative -mx-4 -mt-6 px-4 pb-7 pt-7 sm:-mx-6 sm:px-6 lg:-mx-8 lg:-mt-8 lg:px-8`}>
      <div className="flex flex-wrap items-start justify-between gap-x-8 gap-y-5">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-text-muted">
            {greeting}, {name}
          </p>

          <h1 className="mt-1.5 text-[26px] font-semibold leading-[1.15] tracking-tight text-text sm:text-3xl">
            {copy.line}
            <span className="ml-2 align-middle text-base font-normal tabular-nums text-text-muted sm:text-lg">
              {clockOf(now.getHours() * 60 + now.getMinutes())}
            </span>
          </h1>

          {/* The one sentence that answers the question. */}
          <p
            className={`mt-2.5 max-w-xl text-[15px] leading-relaxed ${TONE_TEXT[tone]}`}
            aria-live="polite"
          >
            {capacity.headline}
          </p>
          <p className="mt-1 max-w-xl text-[13px] leading-relaxed text-text-muted">
            {copy.note}
          </p>
        </div>

        <div className="flex shrink-0 flex-col items-start gap-2">
          {onStartFocus && (
            <button
              type="button"
              onClick={onStartFocus}
              className="focus-ring group inline-flex items-center gap-2.5 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-accent-hover"
            >
              <FocusIcon className="h-4 w-4" />
              Focus
              <ArrowRightIcon className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
            </button>
          )}
          <p className="text-[11px] tabular-nums text-text-muted">
            {duration(focusMinutes)} focused today
          </p>
        </div>
      </div>
    </header>
  );
}

function greetingFor(now: Date): string {
  const h = now.getHours();
  if (h < 5) return "Still up";
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  if (h < 22) return "Good evening";
  return "Winding down";
}

/**
 * The three numbers, given room to be read.
 *
 * These are the inputs to the verdict above. Showing them next to it is what
 * keeps the verdict honest: the user can always check the arithmetic rather
 * than taking a verdict on trust from a piece of software.
 */
export function CapacityNumbers({ capacity }: { capacity: Capacity }) {
  const rows = [
    {
      key: "committed",
      label: "Committed",
      value: duration(capacity.fixedMinutes),
      note: `${capacity.fixedCount} fixed`,
    },
    {
      key: "usable",
      label: "Usable",
      value: duration(capacity.availableMinutes),
      note: "after transitions",
    },
    {
      key: "planned",
      label: "Planned",
      value: duration(capacity.plannedMinutes),
      note: capacity.deltaMinutes < 0 ? `${duration(-capacity.deltaMinutes)} over` : "fits",
    },
  ];

  return (
    <dl className="grid grid-cols-3 gap-3 sm:gap-5">
      {rows.map((r, i) => (
        <div key={r.key} className="min-w-0">
          <dt className="truncate text-[10.5px] font-medium uppercase tracking-[0.14em] text-text-muted">
            {r.label}
          </dt>
          <dd className="mt-1">
            <Ticking value={r.value} delay={i * 70} />
            <span className="mt-0.5 block truncate text-[11px] text-text-muted">{r.note}</span>
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** Numbers arrive by counting, so change is legible rather than instantaneous. */
function Ticking({ value, delay }: { value: string; delay: number }) {
  const [shown, setShown] = useState(value);
  const prev = useRef(value);

  useEffect(() => {
    if (prev.current === value) return;
    if (wantsReducedMotion()) {
      prev.current = value;
      setShown(value);
      return;
    }
    prev.current = value;
    const t = setTimeout(() => setShown(value), 120 + delay);
    return () => clearTimeout(t);
  }, [value, delay]);

  return (
    <span className="block text-xl font-semibold tabular-nums tracking-tight text-text sm:text-2xl">
      {shown}
    </span>
  );
}

/** The full-width explanation of an over-committed day, with the way out. */
export function OverCapacityNotice({
  capacity,
  displacedMinutes,
  onReview,
}: {
  capacity: Capacity;
  displacedMinutes: number;
  onReview: () => void;
}) {
  return (
    <div className={`rounded-xl border border-danger/30 bg-danger/5 p-4 ${TONE_GLOW.alert}`}>
      <p className="text-sm font-medium text-danger">This day does not fit.</p>
      <p className="mt-1.5 text-[13px] leading-relaxed text-text-muted">
        You have {duration(capacity.availableMinutes)} of usable time and{" "}
        {duration(capacity.plannedMinutes)} of planned work — {duration(-capacity.deltaMinutes)}{" "}
        more than the day holds.
        {displacedMinutes > 0 && (
          <>
            {" "}
            Moving {duration(displacedMinutes)} elsewhere would resolve it.
          </>
        )}
      </p>
      <button
        type="button"
        onClick={onReview}
        className="focus-ring mt-3 inline-flex items-center gap-1.5 text-[13px] font-medium text-danger hover:underline"
      >
        See what can move
        <ArrowRightIcon className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

export { TONE_GLOW };
export const TODAY_LINK = Link;
