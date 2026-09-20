"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { animate } from "animejs";
import type { PomodoroSession, FocusTimeSummary } from "@prodapp/shared-types";
import { api } from "@/lib/api";
import { AnimatedNumber } from "@/components/AnimatedNumber";
import { AppShell } from "@/components/AppShell";

function padZero(n: number) {
  return String(n).padStart(2, "0");
}

function formatDuration(seconds: number) {
  return `${padZero(Math.floor(seconds / 60))}:${padZero(seconds % 60)}`;
}

type TimerStatus = "idle" | "running" | "paused";

export default function PomodoroPage() {
  const [workMinutes, setWorkMinutes] = useState(25);
  const [breakMinutes, setBreakMinutes] = useState(5);

  const [status, setStatus] = useState<TimerStatus>("idle");
  const [isBreak, setIsBreak] = useState(false);
  const [remaining, setRemaining] = useState(25 * 60); // seconds
  const totalRef = useRef(25 * 60);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const activeSessionId = useRef<string | null>(null);

  const [summary, setSummary] = useState<FocusTimeSummary | null>(null);

  const loadSummary = useCallback(async () => {
    try {
      const res = await api.get<FocusTimeSummary>("/api/pomodoro/summary");
      setSummary((res as { data: FocusTimeSummary }).data);
    } catch { /* ok */ }
  }, []);

  useEffect(() => { void loadSummary(); }, [loadSummary]);

  // Tick
  useEffect(() => {
    if (status !== "running") {
      if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
      return;
    }
    intervalRef.current = setInterval(() => {
      setRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(intervalRef.current!);
          intervalRef.current = null;
          // End the session asynchronously
          void (async () => {
            if (!isBreak && activeSessionId.current) {
              try { await api.patch(`/api/pomodoro/${activeSessionId.current}/end`, { completed: true }); } catch { /* */ }
              activeSessionId.current = null;
            }
            setStatus("idle");
            if (!isBreak) {
              setIsBreak(true);
              setRemaining(breakMinutes * 60);
              totalRef.current = breakMinutes * 60;
            } else {
              setIsBreak(false);
              setRemaining(workMinutes * 60);
              totalRef.current = workMinutes * 60;
            }
            void loadSummary();
          })();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => { clearInterval(intervalRef.current!); intervalRef.current = null; };
  }, [status, isBreak, workMinutes, breakMinutes, loadSummary]);

  const startWork = async () => {
    setIsBreak(false);
    totalRef.current = workMinutes * 60;
    setRemaining(workMinutes * 60);
    // Start a backend session
    try {
      const res = await api.post<PomodoroSession>("/api/pomodoro", { durationMinutes: workMinutes });
      activeSessionId.current = (res as { data: PomodoroSession }).data.id;
    } catch { activeSessionId.current = null; }
    setStatus("running");
  };

  const startBreak = () => {
    setIsBreak(true);
    totalRef.current = breakMinutes * 60;
    setRemaining(breakMinutes * 60);
    setStatus("running");
  };

  const pause = () => setStatus("paused");

  const resume = () => setStatus("running");

  const skip = async () => {
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
    if (!isBreak && activeSessionId.current) {
      try { await api.patch(`/api/pomodoro/${activeSessionId.current}/end`, { completed: false }); } catch { /* */ }
      activeSessionId.current = null;
    }
    setStatus("idle");
    setIsBreak(false);
    setRemaining(workMinutes * 60);
    totalRef.current = workMinutes * 60;
    void loadSummary();
  };

  const pct = status === "idle" ? 0 : Math.round(((totalRef.current - remaining) / totalRef.current) * 100);
  const radius = 100;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference * (1 - pct / 100);

  return (
    <AppShell>
      <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Focus</h1>
        <p className="mt-1 text-sm text-text-muted">Work in sprints, take breaks, build streaks.</p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        {/* Timer */}
        <section className="rounded-2xl border border-border bg-surface p-6">
          <div className="flex flex-col items-center gap-4">
            <p className="text-xs font-medium uppercase tracking-wider text-text-muted">
              {isBreak ? "Break" : "Focus"}
            </p>

            <div className="relative h-56 w-56">
              <svg viewBox="0 0 220 220" className="h-full w-full -rotate-90">
                <circle cx="110" cy="110" r={radius} fill="none" stroke="#1e2430" strokeWidth="8" />
                <circle cx="110" cy="110" r={radius} fill="none"
                  stroke={isBreak ? "#5ce09e" : "#8fb0ff"} strokeWidth="8"
                  strokeLinecap="round"
                  strokeDasharray={circumference}
                  strokeDashoffset={strokeDashoffset}
                  className="transition-[stroke-dashoffset] duration-1000" />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-4xl font-bold tabular-nums text-text">
                  {formatDuration(remaining)}
                </span>
                {status === "idle" && (
                  <button onClick={isBreak ? startBreak : startWork}
                    className="mt-3 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover">
                    {isBreak ? "Start break" : "Start focus"}
                  </button>
                )}
                {status === "running" && (
                  <button onClick={pause}
                    className="mt-3 rounded-lg border border-border px-4 py-2 text-sm text-text-muted transition-colors hover:border-[#333a48] hover:text-text">
                    Pause
                  </button>
                )}
                {status === "paused" && (
                  <div className="mt-3 flex gap-2">
                    <button onClick={resume}
                      className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover">
                      Resume
                    </button>
                    <button onClick={skip}
                      className="rounded-lg border border-border px-4 py-2 text-sm text-text-muted transition-colors hover:border-[#333a48] hover:text-text">
                      Skip
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Settings sliders */}
            <div className="w-full space-y-3">
              <label className="flex items-center justify-between text-xs text-text-muted">
                <span>Work {workMinutes} min</span>
                <input type="range" min={5} max={60} value={workMinutes} disabled={status !== "idle"}
                  onChange={(e) => {
                    const v = +e.target.value;
                    setWorkMinutes(v);
                    if (status === "idle" && !isBreak) { setRemaining(v * 60); totalRef.current = v * 60; }
                  }}
                  className="w-32 accent-accent" />
              </label>
              <label className="flex items-center justify-between text-xs text-text-muted">
                <span>Break {breakMinutes} min</span>
                <input type="range" min={1} max={30} value={breakMinutes} disabled={status !== "idle"}
                  onChange={(e) => {
                    const v = +e.target.value;
                    setBreakMinutes(v);
                    if (status === "idle" && isBreak) { setRemaining(v * 60); totalRef.current = v * 60; }
                  }}
                  className="w-32 accent-accent" />
              </label>
            </div>
          </div>
        </section>

        {/* Summary + history */}
        <section className="space-y-6">
          <div className="rounded-2xl border border-border bg-surface p-6">
            <h2 className="mb-4 text-sm font-medium uppercase tracking-wider text-text-muted">This session</h2>
            {summary ? (
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <p className="text-2xl font-semibold tabular-nums text-text">{summary.todayMinutes}</p>
                  <p className="text-xs text-text-muted">min today</p>
                </div>
                <div>
                  <p className="text-2xl font-semibold tabular-nums text-text">{summary.sessionsCompleted}</p>
                  <p className="text-xs text-text-muted">completed</p>
                </div>
                <div>
                  <p className="text-2xl font-semibold tabular-nums text-text">{summary.streakDays}</p>
                  <p className="text-xs text-text-muted">day streak</p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-text-muted">Loading…</p>
            )}
          </div>
        </section>
      </div>
      </div>
    </AppShell>
  );
}