"use client";

import { useState } from "react";
import Link from "next/link";
import type { Displacement, Task } from "@prodapp/shared-types";
import { duration } from "@/lib/day";
import { ArrowRightIcon, CheckIcon, PlusIcon, ClockIcon } from "@/components/icons";

/**
 * Work that has no place in the day yet.
 *
 * Split deliberately into two lists, because they mean different things:
 *
 *  - **Reserved** work has been given time. It is in the capacity arithmetic.
 *  - **Unreserved** work is due but has nowhere to live. This is the failure
 *    mode a task app hides best: the deadline is real, the plan is silent, and
 *    the collision only surfaces at 9am on the day.
 */

const PRIORITY_LABEL: Record<string, string> = {
  HIGH: "High",
  MEDIUM: "Medium",
  LOW: "Low",
};

const PRIORITY_TONE: Record<string, string> = {
  HIGH: "text-danger",
  MEDIUM: "text-text-muted",
  LOW: "text-text-muted/70",
};

interface Props {
  planned: Task[];
  unplanned: Task[];
  nextTask: Task | null;
  /** The date being shown, so "overdue" is a fact and not a guess. */
  today: string;
  onComplete: (task: Task) => void;
  onPlanToday: (task: Task) => void;
}

export function OpenWork({ planned, unplanned, nextTask, today, onComplete, onPlanToday }: Props) {
  const [done, setDone] = useState<Record<string, boolean>>({});

  const isDone = (t: Task) => done[t.id] ?? t.completed;

  const toggle = (t: Task) => {
    // Optimistic: the row glides to its completed state immediately and the
    // request settles behind it. A task that must feel instant cannot wait on
    // the network to look responsive.
    setDone((d) => ({ ...d, [t.id]: !isDone(t) }));
    onComplete(t);
  };

  if (planned.length === 0 && unplanned.length === 0) {
    return <QuietDay />;
  }

  return (
    <div className="space-y-6">
      {planned.length > 0 && (
        <section>
          <SectionHead
            title="Reserved for today"
            count={planned.length}
            hint={`${duration(
              planned.filter((t) => !isDone(t)).reduce((a, t) => a + (t.estimateMinutes ?? 0), 0),
            )} of work`}
          />
          <ul className="mt-2.5 space-y-1">
            {planned.map((t) => (
              <WorkRow
                key={t.id}
                task={t}
                done={isDone(t)}
                isNext={nextTask?.id === t.id && !isDone(t)}
                onToggle={() => toggle(t)}
                action={
                  t.completed ? null : (
                    <span className="shrink-0 text-[11px] tabular-nums text-text-muted">
                      {t.estimateMinutes ? duration(t.estimateMinutes) : "no estimate"}
                    </span>
                  )
                }
              />
            ))}
          </ul>
        </section>
      )}

      {unplanned.length > 0 && (
        <section>
          <SectionHead
            title="Due, but not planned"
            count={unplanned.length}
            hint="no time reserved"
            tone="warn"
          />
          <p className="mt-1.5 text-[12px] leading-relaxed text-text-muted">
            These are deadlines with nowhere to live. They are not counted as
            capacity, which means the day above is not really telling the whole
            truth.
          </p>
          <ul className="mt-2.5 space-y-1">
            {unplanned.map((t) => (
              <WorkRow
                key={t.id}
                task={t}
                done={isDone(t)}
                isNext={false}
                onToggle={() => toggle(t)}
                overdue={!!t.dueDate && t.dueDate < today}
                action={
                  t.completed ? null : (
                    <button
                      type="button"
                      onClick={() => onPlanToday(t)}
                      className="focus-ring shrink-0 rounded-md border border-border px-2 py-1 text-[11px] text-text-muted transition-colors hover:border-accent hover:text-accent"
                    >
                      Plan it
                    </button>
                  )
                }
              />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function SectionHead({
  title,
  count,
  hint,
  tone = "calm",
}: {
  title: string;
  count: number;
  hint?: string;
  tone?: "calm" | "warn";
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <h2 className="text-[11px] font-medium uppercase tracking-[0.16em] text-text-muted">
        {title}
        <span className="ml-1.5 tabular-nums opacity-70">{count}</span>
      </h2>
      {hint && (
        <span
          className={`text-[11px] tabular-nums ${tone === "warn" ? "text-warning/80" : "text-text-muted/70"}`}
        >
          {hint}
        </span>
      )}
    </div>
  );
}

function WorkRow({
  task,
  done,
  isNext,
  onToggle,
  action,
  overdue = false,
}: {
  task: Task;
  done: boolean;
  isNext: boolean;
  onToggle: () => void;
  action?: React.ReactNode;
  overdue?: boolean;
}) {
  return (
    <li
      className={`group flex items-center gap-3 rounded-lg border px-3 py-2 transition-all duration-300 ${
        isNext
          ? "border-accent/40 bg-accent-soft/40"
          : "border-transparent hover:border-border hover:bg-surface/60"
      }`}
      style={{
        // Completion collapses the row rather than deleting it, so the day does
        // not reshuffle under the user's cursor.
        opacity: done ? 0.42 : 1,
      }}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-label={done ? `Reopen ${task.title}` : `Complete ${task.title}`}
        aria-pressed={done}
        className={`focus-ring flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-all duration-300 ${
          done
            ? "border-success bg-success text-white"
            : "border-border text-transparent hover:border-accent hover:text-accent/50"
        }`}
      >
        <CheckIcon className="h-3 w-3" />
      </button>

      <div className="min-w-0 flex-1">
        <p
          className={`truncate text-[13.5px] ${
            done ? "text-text-muted line-through" : "text-text"
          }`}
          style={{ textDecorationThickness: "1px" }}
        >
          {task.title}
        </p>
        <p className="mt-px flex flex-wrap items-center gap-x-1.5 text-[11px] text-text-muted">
          {task.courseName && <span>{task.courseName}</span>}
          {task.courseName && task.dueDate && <span className="opacity-40">·</span>}
          {task.dueDate && (
            <span className={overdue ? "text-danger/90" : undefined}>
              {overdue ? "overdue" : "due"} {task.dueDate}
            </span>
          )}
          {!task.dueDate && !task.courseName && (
            <span className="opacity-60">no deadline</span>
          )}
          <span className={PRIORITY_TONE[task.priority] ?? PRIORITY_TONE.MEDIUM}>
            · {PRIORITY_LABEL[task.priority] ?? task.priority.toLowerCase()}
          </span>
        </p>
      </div>

      {isNext && (
        <span className="shrink-0 rounded-full bg-accent px-2 py-0.5 text-[9.5px] font-semibold uppercase tracking-wide text-white">
          next
        </span>
      )}
      {action}
    </li>
  );
}

/**
 * Nothing demanding attention is a legitimate, good state — so it gets a real
 * screen rather than an apology. The brief is right that "No tasks." is a dead
 * end; this is the opposite.
 */
function QuietDay() {
  return (
    <div className="rounded-xl border border-border/60 px-5 py-8 text-center">
      <p className="text-[15px] font-medium text-text">Nothing demanding your attention.</p>
      <p className="mx-auto mt-1.5 max-w-sm text-[13px] leading-relaxed text-text-muted">
        No commitments, nothing reserved, nothing overdue. Enjoy the empty space.
      </p>
      <Link
        href="/tasks?new=1"
        className="focus-ring mt-4 inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-[12.5px] text-text-muted transition-colors hover:border-accent hover:text-accent"
      >
        <PlusIcon className="h-3.5 w-3.5" />
        Capture something anyway
      </Link>
    </div>
  );
}

/**
 * What no longer fits, and where it could go.
 *
 * Every option is a decision the user makes. Nothing here has already
 * happened: the server reports the consequence of an over-committed day and
 * this panel names the trade, then waits.
 */
export function DisplacementPanel({
  displacements,
  onMove,
  onDismiss,
}: {
  displacements: Displacement[];
  onMove: (d: Displacement) => void;
  onDismiss: () => void;
}) {
  if (displacements.length === 0) return null;

  const safe = displacements.filter((d) => d.risk === "safe");
  const risky = displacements.filter((d) => d.risk !== "safe");

  return (
    <section className="rounded-xl border border-warning/25 bg-warning/[0.04] p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="flex items-center gap-1.5 text-sm font-medium text-warning">
            <ClockIcon className="h-3.5 w-3.5" />
            What can move
          </h2>
          <p className="mt-1 text-[12.5px] leading-relaxed text-text-muted">
            Nothing has been changed. These are the trade-offs, cheapest first.
          </p>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="focus-ring shrink-0 text-[11.5px] text-text-muted hover:text-text"
        >
          Dismiss
        </button>
      </div>

      <ul className="mt-3.5 space-y-2">
        {[...safe, ...risky].map((d) => (
          <li
            key={d.task.id}
            className="rounded-lg border border-border/60 bg-surface/60 px-3 py-2.5"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-[13px] text-text">{d.task.title}</p>
                <p className="mt-0.5 text-[11.5px] leading-relaxed text-text-muted">
                  {d.reason}
                </p>
              </div>
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-[9.5px] font-semibold uppercase tracking-wide ${
                  d.risk === "safe"
                    ? "bg-success/15 text-success"
                    : d.risk === "tight"
                      ? "bg-warning/15 text-warning"
                      : "bg-danger/15 text-danger"
                }`}
              >
                {d.risk === "safe" ? "safe" : d.risk === "tight" ? "tight" : "blocked"}
              </span>
            </div>

            <div className="mt-2.5 flex flex-wrap items-center gap-2">
              <span className="text-[11px] tabular-nums text-text-muted">
                {duration(d.estimateMinutes)}
              </span>
              {d.suggestedDate ? (
                <>
                  <ArrowRightIcon className="h-3 w-3 text-text-muted/60" />
                  <button
                    type="button"
                    onClick={() => onMove(d)}
                    className="focus-ring rounded-md border border-border px-2 py-1 text-[11.5px] text-text-muted transition-colors hover:border-accent hover:text-accent"
                  >
                    Move to {d.suggestedDate} ({duration(d.suggestedFreeMinutes)} free)
                  </button>
                </>
              ) : (
                <span className="text-[11.5px] text-text-muted/70">
                  nowhere in the next week has room
                </span>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
