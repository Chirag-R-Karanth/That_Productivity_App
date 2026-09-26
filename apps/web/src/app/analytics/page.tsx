"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { ReviewReport } from "@prodapp/shared-types";
import { api } from "@/lib/api";
import { AppShell } from "@/components/AppShell";
import { Reveal } from "@/components/Reveal";
import { duration } from "@/lib/day";
import { AccuracyChart, PlannedVsAvailable, RhythmChart } from "@/components/review/Charts";
import { ChartIcon, ArrowRightIcon, InfoIcon } from "@/components/icons";

/**
 * Review.
 *
 * This screen exists because "completed: 8 of 10 tasks" is not a review. It is
 * a tally, and tallies cannot tell you anything you did not already know. What
 * is worth reviewing is the gap between what you intended and what happened:
 * the hours you planned against the hours you spent, the estimates against the
 * reality, the time of day you actually do your best work.
 *
 * Every claim on this page is shown with the number of observations behind it.
 * A pattern built from three sessions and one built from thirty are not the
 * same kind of statement, and the interface refuses to pretend otherwise.
 */
export default function ReviewPage() {
  const [period, setPeriod] = useState<"day" | "week">("week");
  const [report, setReport] = useState<ReviewReport | null>(null);
  const [loadError, setLoadError] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api.get<ReviewReport>(`/api/review?period=${period}`);
      if (res.ok) {
        setReport(res.data);
        setLoadError(false);
      }
    } catch {
      setLoadError(true);
    }
  }, [period]);

  useEffect(() => {
    void load();
  }, [load]);

  const s = report?.stats;

  return (
    <AppShell>
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-text">Review</h1>
          <p className="mt-1 text-[13px] text-text-muted">
            {period === "day" ? "What today actually cost." : "What the week actually cost."}
          </p>
        </div>

        <div
          className="inline-flex rounded-lg border border-border p-0.5"
          role="tablist"
          aria-label="Review period"
        >
          {(["day", "week"] as const).map((p) => (
            <button
              key={p}
              type="button"
              role="tab"
              aria-selected={period === p}
              onClick={() => setPeriod(p)}
              className={`focus-ring rounded-md px-3 py-1.5 text-[12.5px] font-medium transition-colors ${
                period === p
                  ? "bg-surface-elevated text-text"
                  : "text-text-muted hover:text-text"
              }`}
            >
              {p === "day" ? "Today" : "This week"}
            </button>
          ))}
        </div>
      </header>

      {loadError && (
        <p className="mb-5 rounded-lg border border-warning/25 bg-warning/[0.05] px-4 py-2.5 text-[13px] text-warning/90">
          Can&apos;t reach the server right now.
        </p>
      )}

      {!report || !s ? (
        <div className="animate-pulse space-y-4">
          <div className="h-24 rounded-xl bg-surface-elevated/60" />
          <div className="h-40 rounded-xl bg-surface-elevated/40" />
        </div>
      ) : (
        <div className="space-y-8">
          {/* ---- Intent vs reality ------------------------------------------ */}
          <Reveal>
            <section>
              <h2 className="text-[11px] font-medium uppercase tracking-[0.16em] text-text-muted">
                Planned against actual
              </h2>

              {s.plannedMinutes === 0 && s.focusMinutes === 0 ? (
                <p className="mt-3 text-[13px] leading-relaxed text-text-muted">
                  Nothing was planned and nothing was focused in this period, so
                  there is nothing to compare. Reserve time on a task and it will
                  start showing up here.
                </p>
              ) : (
                <>
                  <div className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <span className="text-3xl font-semibold tabular-nums tracking-tight text-text">
                      {duration(s.completedMinutes)}
                    </span>
                    <span className="text-[13px] text-text-muted">
                      completed of{" "}
                      <span className="tabular-nums text-text">{duration(s.plannedMinutes)}</span>{" "}
                      planned
                    </span>
                  </div>

                  {/* Two bars, same scale, so the shortfall is a length not a number. */}
                  <div className="mt-3.5 space-y-2">
                    <Bar
                      label="Planned"
                      minutes={s.plannedMinutes}
                      max={Math.max(1, s.plannedMinutes, s.completedMinutes)}
                      className="bg-border"
                    />
                    <Bar
                      label="Completed"
                      minutes={s.completedMinutes}
                      max={Math.max(1, s.plannedMinutes, s.completedMinutes)}
                      className="bg-accent"
                    />
                    <Bar
                      label="Focused"
                      minutes={s.focusMinutes}
                      max={Math.max(1, s.plannedMinutes, s.completedMinutes)}
                      className="bg-success/75"
                    />
                  </div>

                  <dl className="mt-4 grid grid-cols-2 gap-x-5 gap-y-3 sm:grid-cols-4">
                    <Stat
                      label="Tasks"
                      value={`${s.tasksCompleted}/${s.tasksPlanned}`}
                      note={s.tasksPlanned > 0 ? `${Math.round(s.completionRate * 100)}% done` : "none planned"}
                    />
                    <Stat
                      label="Focus"
                      value={duration(s.focusMinutes)}
                      note={`${s.sessionsCompleted} session${s.sessionsCompleted === 1 ? "" : "s"}`}
                    />
                    <Stat
                      label="Cut short"
                      value={String(s.sessionsAbandoned)}
                      note={s.sessionsCompleted + s.sessionsAbandoned === 0 ? "no sessions" : "of all sessions"}
                      tone={s.sessionsAbandoned > s.sessionsCompleted ? "warn" : "calm"}
                    />
                    <Stat
                      label="Rescheduled"
                      value={duration(s.rescheduledMinutes)}
                      note="moved, not done"
                      tone={s.rescheduledMinutes > 0 ? "warn" : "calm"}
                    />
                  </dl>
                </>
              )}
            </section>
          </Reveal>

          {/* ---- Rhythm ------------------------------------------------------ */}
          {s.focusMinutes > 0 && (
            <Reveal delay={60}>
              <section>
                <h2 className="text-[11px] font-medium uppercase tracking-[0.16em] text-text-muted">
                  When the focus actually happened
                </h2>
                <div className="mt-3">
                  <RhythmChart data={s.focusByHour} />
                </div>
              </section>
            </Reveal>
          )}

          {/* ---- Day by day -------------------------------------------------- */}
          <Reveal delay={100}>
            <section>
              <h2 className="text-[11px] font-medium uppercase tracking-[0.16em] text-text-muted">
                Each day, planned against what it could hold
              </h2>
              <p className="mt-1.5 text-[12px] leading-relaxed text-text-muted">
                The upper bar is the time each day could have given you. The
                lower bar is what you planned to use.
              </p>
              <div className="mt-3.5">
                <PlannedVsAvailable days={report.days} />
              </div>
            </section>
          </Reveal>

          {/* ---- Patterns ---------------------------------------------------- */}
          <Reveal delay={140}>
            <section>
              <h2 className="text-[11px] font-medium uppercase tracking-[0.16em] text-text-muted">
                Patterns
              </h2>

              {report.patterns.length === 0 ? (
                <div className="mt-3 rounded-xl border border-border/60 px-5 py-8 text-center">
                  <ChartIcon className="mx-auto h-5 w-5 text-text-muted/70" />
                  <p className="mt-2.5 text-[14px] font-medium text-text">
                    Nothing conclusive yet.
                  </p>
                  <p className="mx-auto mt-1.5 max-w-md text-[12.5px] leading-relaxed text-text-muted">
                    Patterns need repeated evidence before they are worth
                    stating. Estimate some tasks, plan them on a day, and focus
                    on them — this page will start telling you which of your
                    assumptions do not survive contact with reality.
                  </p>
                </div>
              ) : (
                <ul className="mt-3 space-y-2.5">
                  {report.patterns.map((p) => (
                    <li
                      key={p.id}
                      className="rounded-xl border border-border bg-surface/60 px-4 py-3.5"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <p className="text-[13.5px] font-medium leading-snug text-text">
                          {p.title}
                        </p>
                        <span
                          className="shrink-0 rounded-full border border-border px-2 py-0.5 text-[10px] tabular-nums text-text-muted"
                          title={`Based on ${p.samples} observations`}
                        >
                          n={p.samples}
                        </span>
                      </div>
                      <p className="mt-1.5 text-[12.5px] leading-relaxed text-text-muted">
                        {p.detail}
                      </p>
                      <Confidence value={p.confidence} />
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </Reveal>

          {/* ---- Estimate accuracy ------------------------------------------- */}
          {s.accuracy.length > 0 && (
            <Reveal delay={180}>
              <section>
                <h2 className="text-[11px] font-medium uppercase tracking-[0.16em] text-text-muted">
                  Estimates against reality
                </h2>
                <p className="mt-1.5 text-[12px] leading-relaxed text-text-muted">
                  Centred on matching your estimate. Extending right means the
                  work took longer than you thought.
                </p>
                <div className="mt-3.5">
                  <AccuracyChart accuracy={s.accuracy} />
                </div>
              </section>
            </Reveal>
          )}

          {s.overloadedDays > 0 && (
            <Reveal delay={200}>
              <p className="flex items-start gap-2 rounded-lg border border-border/60 bg-surface/40 px-3.5 py-2.5 text-[12px] leading-relaxed text-text-muted">
                <InfoIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {s.overloadedDays} of {report.days.length} days were planned beyond
                the time they could hold. The most useful fix is usually a
                smaller plan, not a longer day.
              </p>
            </Reveal>
          )}

          <p className="pt-2 text-center text-[12px] text-text-muted">
            <Link href="/" className="focus-ring inline-flex items-center gap-1.5 hover:text-text">
              Back to today
              <ArrowRightIcon className="h-3 w-3" />
            </Link>
          </p>
        </div>
      )}
    </AppShell>
  );
}

function Bar({
  label,
  minutes,
  max,
  className,
}: {
  label: string;
  minutes: number;
  max: number;
  className: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-20 shrink-0 text-[11.5px] text-text-muted">{label}</span>
      <div className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-surface-elevated">
        <div
          className={`h-full rounded-full transition-[width] duration-700 ease-out ${className}`}
          style={{ width: `${Math.max(minutes > 0 ? 1.5 : 0, (minutes / max) * 100)}%` }}
        />
      </div>
      <span className="w-14 shrink-0 text-right text-[11px] tabular-nums text-text-muted">
        {duration(minutes)}
      </span>
    </div>
  );
}

function Stat({
  label,
  value,
  note,
  tone = "calm",
}: {
  label: string;
  value: string;
  note?: string;
  tone?: "calm" | "warn";
}) {
  return (
    <div className="min-w-0">
      <dt className="truncate text-[10.5px] font-medium uppercase tracking-[0.14em] text-text-muted">
        {label}
      </dt>
      <dd
        className={`mt-0.5 text-lg font-semibold tabular-nums tracking-tight ${
          tone === "warn" ? "text-warning" : "text-text"
        }`}
      >
        {value}
      </dd>
      {note && <p className="truncate text-[11px] text-text-muted">{note}</p>}
    </div>
  );
}

/** How much evidence stands behind a claim — shown as length, not a percentage. */
function Confidence({ value }: { value: number }) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  return (
    <div className="mt-2.5 flex items-center gap-2" title={`Confidence ${pct}%`}>
      <div className="h-[3px] w-24 overflow-hidden rounded-full bg-surface-elevated">
        <div
          className="h-full rounded-full bg-text-muted/60 transition-[width] duration-700 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-[10px] tabular-nums text-text-muted/60">
        {pct < 40 ? "early signal" : pct < 70 ? "consistent" : "well established"}
      </span>
    </div>
  );
}
