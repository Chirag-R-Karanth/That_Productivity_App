"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { DayModel, Displacement, Task } from "@prodapp/shared-types";
import { api } from "@/lib/api";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/lib/auth";
import { CapacityArc } from "@/components/today/CapacityArc";
import { DayTimeline } from "@/components/today/DayTimeline";
import { Verdict, CapacityNumbers, OverCapacityNotice } from "@/components/today/Verdict";
import { DisplacementPanel, OpenWork } from "@/components/today/OpenWork";
import { dayKey, minutesNow, nextUp, refreshNow } from "@/lib/day";

/**
 * Today.
 *
 * One day, one request, one ordered stream. This screen deliberately does not
 * look like a dashboard: there are no KPI cards and no grid of widgets,
 * because the question it answers — "what matters now?" — is a question about
 * sequence and pressure, not about tallies.
 *
 * The order is fixed and load-bearing:
 *   the answer  →  the arithmetic behind it  →  the day to scale
 *   →  work with no time yet  →  what to do next
 */
export default function TodayPage() {
  const { user } = useAuth();
  const router = useRouter();

  const [model, setModel] = useState<DayModel | null>(null);
  const [displacements, setDisplacements] = useState<Displacement[]>([]);
  const [showDisplacement, setShowDisplacement] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [now, setNow] = useState(() => new Date());

  const today = useMemo(() => dayKey(now), [now]);
  const nowMinutes = minutesNow(now);

  const load = useCallback(async () => {
    // The day model already carries today's focus minutes, so this screen needs
    // exactly one request to know everything it renders.
    const dayRes = await api.get<DayModel>(`/api/day?date=${today}`);
    if (!dayRes.ok) return;
    setModel(dayRes.data);

    // Only ask about displacement when the day genuinely does not fit.
    if (
      dayRes.data.capacity.verdict === "over" ||
      dayRes.data.capacity.verdict === "tight"
    ) {
      const d = await api.get<{ displacements: Displacement[] }>(
        `/api/day/${today}/displacement`,
      );
      if (d.ok) setDisplacements(d.data.displacements);
    } else {
      setDisplacements([]);
    }
  }, [today]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        await load();
        if (!cancelled) setLoadError(false);
      } catch {
        // Keep the last good state. A refresh that fails is not a reason to
        // blank the user's day.
        if (!cancelled) setLoadError(true);
      }
    };
    void run();
    const interval = setInterval(() => void run(), 60_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [load]);

  // The clock and "is this happening now" flags advance without a refetch.
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  const name = (user?.name || "").trim() || user?.email.split("@")[0] || "there";
  const capacity = model?.capacity;
  const isOver = capacity?.verdict === "over" || capacity?.verdict === "tight";

  const nextTask = useMemo(() => (model ? nextUp([...model.planned, ...model.unplanned]) : null), [model]);

  // `isNow` is recomputed locally so the highlight keeps moving between refetches.
  const timeline = useMemo(
    () => (model ? refreshNow(model.timeline, nowMinutes, model.date === today) : []),
    [model, nowMinutes, today],
  );

  const complete = useCallback(
    async (task: Task) => {
      const willComplete = !task.completed;
      // Optimistic: the row already changed, so do not wait on the round trip.
      setModel((m) =>
        m
          ? {
              ...m,
              planned: m.planned.map((t) =>
                t.id === task.id ? { ...t, completed: willComplete } : t,
              ),
              unplanned: m.unplanned.map((t) =>
                t.id === task.id ? { ...t, completed: willComplete } : t,
              ),
              progress: {
                ...m.progress,
                tasksDone: Math.max(0, m.progress.tasksDone + (willComplete ? 1 : -1)),
                completedMinutes:
                  m.progress.completedMinutes + (willComplete ? task.estimateMinutes ?? 0 : -(task.estimateMinutes ?? 0)),
              },
            }
          : m,
      );
      try {
        await api.post(`/api/tasks/${task.id}/complete`, { completed: willComplete });
      } catch {
        // The sync strip already reports the failure; reload to resync truth.
        void load();
      }
    },
    [load],
  );

  const planToday = useCallback(
    async (task: Task) => {
      setModel((m) =>
        m
          ? {
              ...m,
              planned: [...m.planned, { ...task, plannedDate: today }],
              unplanned: m.unplanned.filter((t) => t.id !== task.id),
            }
          : m,
      );
      try {
        await api.patch(`/api/tasks/${task.id}`, { plannedDate: today });
        void load();
      } catch {
        void load();
      }
    },
    [today, load],
  );

  const moveTask = useCallback(
    async (d: Displacement) => {
      if (!d.suggestedDate) return;
      await api.patch(`/api/tasks/${d.task.id}`, { plannedDate: d.suggestedDate });
      setDisplacements((prev) => prev.filter((x) => x.task.id !== d.task.id));
      void load();
    },
    [load],
  );

  if (!model || !capacity) {
    return (
      <AppShell>
        <TodaySkeleton />
        {loadError && <Unreachable />}
      </AppShell>
    );
  }

  const hasAnything = model.timeline.length > 0;

  return (
    <AppShell>
      <Verdict
        capacity={capacity}
        phase={model.phase}
        now={now}
        name={name}
        focusMinutes={model.progress.focusMinutes}
        onStartFocus={() => router.push("/zen")}
      />

      {loadError && <Unreachable />}

      <div className="mt-5 space-y-7">
        {/* The arithmetic, always visible, so the verdict is checkable. */}
        <CapacityNumbers capacity={capacity} />
        <CapacityArc capacity={capacity} />

        {isOver && (
          <OverCapacityNotice
            capacity={capacity}
            displacedMinutes={displacements
              .filter((d) => d.risk === "safe")
              .reduce((a, d) => a + d.estimateMinutes, 0)}
            onReview={() => setShowDisplacement(true)}
          />
        )}

        {/* The day to scale. */}
        {hasAnything ? (
          <section>
            <h2 className="mb-2 text-[11px] font-medium uppercase tracking-[0.16em] text-text-muted">
              The day
            </h2>
            <DayTimeline
              blocks={timeline}
              free={model.free}
              windowStart={capacity.windowStartMinutes}
              windowEnd={capacity.windowEndMinutes}
              nowMinutes={nowMinutes}
              isToday={model.date === today}
              onActivate={(b) => {
                if (b.taskId) router.push(`/tasks?focus=${b.taskId}`);
                else if (b.kind === "class") router.push("/timetable");
                else router.push("/calendar");
              }}
            />
          </section>
        ) : (
          <section>
            <h2 className="mb-2 text-[11px] font-medium uppercase tracking-[0.16em] text-text-muted">
              The day
            </h2>
            <div className="rounded-xl border border-border/60 px-5 py-10 text-center">
              <p className="text-[15px] font-medium text-text">The day is entirely yours.</p>
              <p className="mx-auto mt-1.5 max-w-sm text-[13px] leading-relaxed text-text-muted">
                Nothing scheduled, nothing reserved. Whatever you want to make of
                it is a reasonable use of the time.
              </p>
              <Link
                href="/calendar"
                className="focus-ring mt-4 inline-block text-[12.5px] text-accent hover:underline"
              >
                See the wider week →
              </Link>
            </div>
          </section>
        )}

        {/* Work without a time yet. */}
        <section>
          <h2 className="mb-2 text-[11px] font-medium uppercase tracking-[0.16em] text-text-muted">
            Work
          </h2>
          <OpenWork
            planned={model.planned}
            unplanned={model.unplanned}
            nextTask={nextTask}
            today={model.date}
            onComplete={(t) => void complete(t)}
            onPlanToday={(t) => void planToday(t)}
          />
        </section>

        {isOver && showDisplacement && displacements.length > 0 && (
          <DisplacementPanel
            displacements={displacements}
            onMove={(d) => void moveTask(d)}
            onDismiss={() => setShowDisplacement(false)}
          />
        )}
      </div>
    </AppShell>
  );
}

function Unreachable() {
  return (
    <div className="mt-4 rounded-xl border border-warning/25 bg-warning/[0.05] px-4 py-3 text-[13px] text-warning/90">
      Can&apos;t reach the server. Retrying automatically — nothing you have done is lost.
    </div>
  );
}

/**
 * Placeholder shown only for the first load, so the page arrives in its final
 * shape rather than assembling itself in front of the user.
 */
function TodaySkeleton() {
  return (
    <div className="animate-pulse space-y-6">
      <div className="space-y-3 pt-4">
        <div className="h-3 w-40 rounded bg-surface-elevated" />
        <div className="h-8 w-72 rounded bg-surface-elevated" />
        <div className="h-4 w-96 max-w-full rounded bg-surface-elevated" />
      </div>
      <div className="h-3 w-full rounded-full bg-surface-elevated" />
      <div className="h-72 rounded-xl bg-surface-elevated/60" />
    </div>
  );
}
