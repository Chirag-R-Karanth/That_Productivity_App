"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { animate } from "animejs";
import { AuthGate } from "@/lib/authGate";
import { api } from "@/lib/api";
import { FlipClock } from "@/components/FlipClock";
import { CheckIcon, PauseIcon, PlayIcon, RestartIcon, SkipIcon, SpeakerOffIcon, SpeakerOnIcon } from "@/components/icons";
import { wantsReducedMotion } from "@/lib/motion";
import { SOUND_KEY, parseSoundPref, playChime, playHourChime, playTick, toggleSound, unlock } from "@/lib/sounds";
import { useStoredPref } from "@/lib/storedPref";

type Kind = "focus" | "short" | "long";
type Screen = "setup" | "running" | "paused" | "focus-done" | "break-done";
type Mode = "clock" | "pomodoro";

interface ZenTask {
  id: string;
  title: string;
  notes: string | null;
  completed: boolean;
}

interface MeSettings {
  pomodoroWorkMinutes: number | null;
  pomodoroBreakMinutes: number | null;
  pomodoroLongBreakMinutes: number | null;
  pomodoroSessionsPerCycle: number | null;
  chimeOnTheHour: boolean;
}

const WORK_PRESETS = [25, 50, 60];
const BREAK_PRESETS = [5, 10];
const LONG_PRESETS = [15, 20, 30];
const CYCLE_OPTIONS = [2, 3, 4, 6];

const CLOCK_FONT = { fontSize: "min(18vw, 60vh)" };
const COUNTDOWN_FONT = { fontSize: "min(21vw, 63vh)" };
const COUNTDOWN_FONT_HOURS = { fontSize: "min(13vw, 40vh)" };

const TICK_MS = 250;

// A module-level cached clock rather than a ref. `useSyncExternalStore` needs a
// snapshot whose identity is stable between reads, and reading a ref during
// render is not reactive, which is what forced the old `repaint` counter hack.
let cachedNow = 0;
let clockTimer: number | null = null;
const clockSubscribers = new Set<() => void>();

function subscribeClock(notify: () => void) {
  clockSubscribers.add(notify);
  if (clockTimer === null) {
    cachedNow = Date.now();
    clockTimer = window.setInterval(() => {
      cachedNow = Date.now();
      for (const sub of clockSubscribers) sub();
    }, TICK_MS);
  }
  return () => {
    clockSubscribers.delete(notify);
    if (clockSubscribers.size === 0 && clockTimer !== null) {
      window.clearInterval(clockTimer);
      clockTimer = null;
    }
  };
}

const getClockSnapshot = () => cachedNow;
const getClockServerSnapshot = () => 0;

function useNow(): number {
  return useSyncExternalStore(
    subscribeClock,
    getClockSnapshot,
    getClockServerSnapshot,
  );
}

interface Timer {
  kind: Kind;
  /** Total length in seconds, kept so a restart restores the full session. */
  total: number;
  /** Wall-clock ms at which the countdown reaches zero. */
  endsAt: number;
}

const MODE_KEY = "prodapp:zen-mode";

function parseModePref(raw: string | null): Mode {
  return raw === "clock" || raw === "pomodoro" ? raw : "pomodoro";
}

export default function ZenPage() {
  const router = useRouter();

  const rootRef = useRef<HTMLDivElement>(null);
  const serverIdRef = useRef<string | null>(null);
  const [serverSessionOpen, setServerSessionOpen] = useState(false);
  const completedGuard = useRef(false);
  const lastMinuteRef = useRef<number>(-1);
  const lastSecRef = useRef<number>(-1);
  const lastHourRef = useRef<number>(0);

  const now = useNow();
  const [timer, setTimer] = useState<Timer | null>(null);
  const [pausedRemaining, setPausedRemaining] = useState(0);
  const [exiting, setExiting] = useState(false);
  const [screen, setScreen] = useState<Screen>("setup");
  const [running, setRunning] = useState(false);
  const [confirmQuit, setConfirmQuit] = useState(false);
  const [mode, setModePref] = useStoredPref(MODE_KEY, parseModePref, "pomodoro");
  const [soundOn] = useStoredPref(SOUND_KEY, parseSoundPref, true);

  const [tasks, setTasks] = useState<ZenTask[]>([]);
  const [selectedTask, setSelectedTask] = useState<ZenTask | null>(null);
  const [settings, setSettings] = useState<MeSettings>({
    pomodoroWorkMinutes: 25,
    pomodoroBreakMinutes: 5,
    pomodoroLongBreakMinutes: 15,
    pomodoroSessionsPerCycle: 4,
    chimeOnTheHour: true,
  });
  const [workCustom, setWorkCustom] = useState<number | null>(null);
  const [shortCustom, setShortCustom] = useState<number | null>(null);
  const [longCustom, setLongCustom] = useState<number | null>(null);
  const [cycleCustom, setCycleCustom] = useState<number | null>(null);
  const [focusesDone, setFocusesDone] = useState(0);

  const workMinutes = workCustom ?? settings.pomodoroWorkMinutes ?? 25;
  const shortMinutes = shortCustom ?? settings.pomodoroBreakMinutes ?? 5;
  const longMinutes = longCustom ?? settings.pomodoroLongBreakMinutes ?? 15;
  const perCycle = cycleCustom ?? settings.pomodoroSessionsPerCycle ?? 4;

  // Mode and sound are read straight from the localStorage store, so only the
  // remote data still needs loading.
  useEffect(() => {
    void (async () => {
      const [tasksRes, meRes] = await Promise.all([
        api.get<ZenTask[]>("/api/tasks"),
        api.get<MeSettings>("/api/auth/me"),
      ]);
      if ("ok" in tasksRes && tasksRes.ok) {
        setTasks(tasksRes.data.filter((t) => !t.completed).slice(0, 8));
      }
      if ("ok" in meRes && meRes.ok) {
        setSettings({
          pomodoroWorkMinutes: meRes.data.pomodoroWorkMinutes,
          pomodoroBreakMinutes: meRes.data.pomodoroBreakMinutes,
          pomodoroLongBreakMinutes: meRes.data.pomodoroLongBreakMinutes,
          pomodoroSessionsPerCycle: meRes.data.pomodoroSessionsPerCycle,
          chimeOnTheHour: meRes.data.chimeOnTheHour ?? true,
        });
      }
    })();
  }, []);

  // Zen room: dark theme on <html>, body scroll locked, big soft fade-in.
  useEffect(() => {
    const html = document.documentElement;
    const hadZen = html.classList.contains("zen");
    html.classList.add("zen");
    document.body.style.overflow = "hidden";
    const prevTitle = document.title;
    document.title = "Zen";

    if (!wantsReducedMotion() && rootRef.current) {
      animate(rootRef.current, {
        opacity: [0, 1],
        scale: [0.996, 1],
        duration: 500,
        ease: "outCubic",
      });
    }

    return () => {
      if (!hadZen) html.classList.remove("zen");
      document.body.style.overflow = "";
      document.title = prevTitle;
    };
  }, []);

  // The ticker itself is the useNow() subscription above; nothing to poll here.
  const closeOpenServerSession = useCallback(async (completed: boolean) => {
    const id = serverIdRef.current;
    if (!id) return;
    setServerSessionOpen(false);
    serverIdRef.current = null;
    void api.patch(`/api/pomodoro/${id}/end`, { completed });
  }, []);

  const beginSession = useCallback(
    (kind: Kind, totalMinutes: number) => {
      setTimer({
        kind,
        total: totalMinutes * 60,
        endsAt: Date.now() + totalMinutes * 60_000,
      });
      setPausedRemaining(0);
      completedGuard.current = false;
      setRunning(true);
      setScreen("running");

      if (kind === "focus") {
        setServerSessionOpen(false);
        void api
          .post<{ id: string }>("/api/pomodoro", {
            taskId: selectedTask?.id ?? null,
            durationMinutes: totalMinutes,
          })
          .then((res) => {
            if ("ok" in res && res.ok) {
              serverIdRef.current = res.data.id;
              setServerSessionOpen(true);
            }
          });
      }
    },
    [selectedTask],
  );

  const remaining = (() => {
    if (!running || !timer) return pausedRemaining;
    return Math.max(0, Math.ceil((timer.endsAt - now) / 1000));
  })();

  /** The session currently loaded, if any — safe to read during render. */
  const activeKind: Kind = timer?.kind ?? "focus";

  // One flip-clunk per tick: the 12-hour clock face flips every minute,
  // the countdown flips every second while live (paused/idle stays silent).
  useEffect(() => {
    if (mode === "clock") {
      const minute = Math.floor(now / 60_000);
      if (minute !== lastMinuteRef.current) {
        lastMinuteRef.current = minute;
        playTick();
      }
      return;
    }
    const sec = Math.floor(now / 1000);
    const counting =
      (screen === "running" || screen === "paused") && running;
    if (sec !== lastSecRef.current) {
      lastSecRef.current = sec;
      if (counting) playTick();
    }
  }, [now, mode, screen, running]);

  // Hourly chime while sitting on the clock face.
  useEffect(() => {
    if (mode !== "clock" || !settings.chimeOnTheHour) return;
    const hour = Math.floor(now / 3_600_000);
    if (hour !== lastHourRef.current) {
      lastHourRef.current = hour;
      playHourChime();
    }
  }, [now, mode, settings.chimeOnTheHour]);

  // Complete when we cross zero (guarded, runs once per session) → chime.
  useEffect(() => {
    if (!running || completedGuard.current) return;
    if (remaining > 0) return;
    completedGuard.current = true;
    void (async () => {
      const kind = activeKind;
      if (kind === "focus") {
        await closeOpenServerSession(true);
        setFocusesDone((n) => n + 1);
      }
      setRunning(false);
      setScreen(kind === "focus" ? "focus-done" : "break-done");
      playChime();
    })();
  }, [remaining, running, activeKind, closeOpenServerSession]);

  const nextBreakKind = (afterCount: number): Kind =>
    afterCount % perCycle === 0 ? "long" : "short";

  const startBreak = () => {
    const kind = nextBreakKind(focusesDone);
    beginSession(kind, kind === "long" ? longMinutes : shortMinutes);
  };

  const togglePause = useCallback(() => {
    if (running && timer) {
      setPausedRemaining(
        Math.max(0, Math.ceil((timer.endsAt - now) / 1000)),
      );
      setRunning(false);
      setScreen("paused");
    } else {
      setTimer((t) =>
        t ? { ...t, endsAt: Date.now() + pausedRemaining * 1000 } : t,
      );
      setRunning(true);
      setScreen("running");
    }
  }, [running, timer, now, pausedRemaining]);

  const restartSession = () => {
    if (!timer) return;
    beginSession(timer.kind, Math.round(timer.total / 60));
  };

  const skipSession = async () => {
    const kind = activeKind;
    if (kind === "focus") await closeOpenServerSession(false);
    setPausedRemaining(0);
    setRunning(false);
    setScreen("setup");
  };

  const markTaskComplete = async () => {
    if (!selectedTask) return;
    const res = await api.post<ZenTask>(`/api/tasks/${selectedTask.id}/complete`, { completed: true });
    if ("ok" in res && res.ok) setTasks((ts) => ts.filter((t) => t.id !== selectedTask.id));
  };

  const switchMode = (m: Mode) => {
    if (m === mode) return;
    if (m === "pomodoro") setFocusesDone(0);
    if (mode === "pomodoro" && activeKind === "focus" && serverSessionOpen) {
      void closeOpenServerSession(false);
    }
    setModePref(m);
    setScreen("setup");
    setRunning(false);
    setPausedRemaining(0);
    setConfirmQuit(false);
  };

  const exitZen = useCallback(() => {
    void closeOpenServerSession(false);
    if (exiting) return;
    setExiting(true);
    setConfirmQuit(false);
    if (wantsReducedMotion() || !rootRef.current) {
      goBack(router);
      return;
    }
    animate(rootRef.current, {
      opacity: 0,
      scale: 0.995,
      duration: 260,
      ease: "inCubic",
      complete: () => goBack(router),
    });
  }, [exiting, closeOpenServerSession, router]);

  // Keyboard: Esc = quit, Space = play/pause (pomodoro only).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (exiting) return;
      if (e.key === "Escape") {
        e.preventDefault();
        if (mode === "clock") exitZen();
        else if (screen === "running" || screen === "paused") setConfirmQuit(true);
        else exitZen();
      } else if (e.key === " " || e.code === "Space") {
        if (mode === "pomodoro" && (screen === "running" || screen === "paused")) {
          e.preventDefault();
          togglePause();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [screen, confirmQuit, exiting, togglePause, exitZen, mode]);

  const kindLabel: Record<Kind, string> = {
    focus: "Focus",
    short: "Short break",
    long: "Long break",
  };

  // Wall-clock pieces for Clock mode (reads the live ticker).
  const wallClock = (() => {
    const d = new Date(now);
    const hour = d.getHours();
    const phase =
      hour < 5 ? "Night" : hour < 12 ? "Morning" : hour < 17 ? "Afternoon" : hour < 21 ? "Evening" : "Night";
    return {
      sod: hour * 3600 + d.getMinutes() * 60 + d.getSeconds(),
      date: d.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" }),
      phase,
    };
  })();

  return (
    <AuthGate>
      <div
        ref={rootRef}
        onPointerDownCapture={() => unlock()}
        className="fixed inset-0 z-[70] flex flex-col overflow-hidden bg-background px-6 py-6 text-text"
      >
        {/* Top bar */}
        <div className="flex w-full items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex rounded-full border border-border p-0.5">
              {(["clock", "pomodoro"] as Mode[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => switchMode(m)}
                  className={`rounded-full px-3.5 py-1 text-xs font-medium transition-colors ${
                    mode === m ? "bg-text/10 text-text" : "text-text-muted hover:text-text"
                  }`}
                >
                  {m === "clock" ? "Clock" : "Focus"}
                </button>
              ))}
            </div>
            {mode === "pomodoro" && (screen === "running" || screen === "paused") && (
              <span className="truncate text-sm text-text/80">
                {selectedTask ? selectedTask.title : kindLabel[activeKind]}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                toggleSound();
              }}
              title={soundOn ? "Sound on" : "Sound off"}
              className="rounded-full border border-border p-2 text-text-muted transition-colors hover:border-text/20 hover:text-text"
            >
              {soundOn ? <SpeakerOnIcon className="h-4 w-4" /> : <SpeakerOffIcon className="h-4 w-4" />}
            </button>
            <button
              type="button"
              onClick={() => exitZen()}
              className="rounded-full border border-border px-3 py-1.5 text-[11px] font-medium tracking-wide text-text-muted transition-colors hover:border-text/20 hover:text-text"
            >
              Esc · Exit
            </button>
          </div>
        </div>

        {/* Center stage */}
        <div className="flex w-full min-h-0 flex-1 flex-col items-center justify-center">
          {mode === "clock" ? (
            <div className="flex flex-col items-center gap-10">
              <div style={CLOCK_FONT} className="leading-none">
                <FlipClock seconds={wallClock.sod} twelveHour />
              </div>
              <div className="flex flex-col items-center gap-3">
                <p className="text-2xl font-medium tracking-wide text-text sm:text-4xl">{wallClock.date}</p>
                <p className="text-sm uppercase tracking-[0.45em] text-text-muted">{wallClock.phase}</p>
              </div>
              <p className="text-[11px] text-text-muted/60">
                {settings.chimeOnTheHour ? "Chimes on the hour" : "Hourly chime off"} · Esc exits Zen
              </p>
            </div>
          ) : screen === "running" || screen === "paused" ? (
            <div className="flex flex-col items-center gap-8">
              <div
                style={remaining >= 3600 ? COUNTDOWN_FONT_HOURS : COUNTDOWN_FONT}
                className="leading-none"
              >
                <FlipClock seconds={remaining} />
              </div>
              <div className="flex flex-col items-center gap-3">
                <p className="text-xs uppercase tracking-[0.4em] text-text-muted">
                  {running ? kindLabel[activeKind] : "Paused"}
                </p>
                <CycleDots done={focusesDone} cycle={perCycle} />
                <div className="mt-1 flex items-center gap-2.5">
                  <button
                    type="button"
                    onClick={togglePause}
                    aria-label={running ? "Pause" : "Resume"}
                    className="grid h-12 w-12 place-items-center rounded-full border border-border text-text transition-colors hover:border-text/30 hover:text-text"
                  >
                    {running ? <PauseIcon className="h-5 w-5" /> : <PlayIcon className="h-5 w-5 translate-x-[1px]" />}
                  </button>
                  <button
                    type="button"
                    onClick={restartSession}
                    aria-label="Restart session"
                    className="grid h-9 w-9 place-items-center rounded-full border border-border text-text-muted transition-colors hover:border-text/30 hover:text-text"
                  >
                    <RestartIcon className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => void skipSession()}
                    aria-label="Skip session"
                    className="grid h-9 w-9 place-items-center rounded-full border border-border text-text-muted transition-colors hover:border-text/30 hover:text-text"
                  >
                    <SkipIcon className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          ) : screen === "focus-done" || screen === "break-done" ? (
            <div className="flex flex-col items-center gap-8 text-center">
              <div className="flex flex-col items-center gap-3">
                <span className="grid h-16 w-16 place-items-center rounded-full bg-accent-soft text-accent">
                  <CheckIcon className="h-8 w-8" />
                </span>
                <h1 className="text-3xl font-semibold tracking-tight">
                  {screen === "focus-done" ? "Session complete" : "Break&rsquo;s over"}
                </h1>
                {screen === "focus-done" ? (
                  <p className="max-w-md text-sm text-text-muted">
                    {focusesDone % perCycle === 0
                      ? `${focusesDone} focus sessions — you earned a long break.`
                      : `Nice work. ${selectedTask ? `"${selectedTask.title}"` : "That task"} is moving.`}
                  </p>
                ) : (
                  <p className="max-w-md text-sm text-text-muted">
                    Ready when you are — {focusesDone} session{focusesDone === 1 ? "" : "s"} so far.
                  </p>
                )}
                <CycleDots done={focusesDone} cycle={perCycle} />
              </div>
              <div className="flex flex-wrap items-center justify-center gap-3">
                {screen === "focus-done" && (
                  <>
                    {selectedTask && (
                      <button
                        type="button"
                        onClick={() => {
                          void markTaskComplete();
                          startBreak();
                        }}
                        className="flex items-center gap-2 rounded-xl bg-accent px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent-hover"
                      >
                        <CheckIcon className="h-4 w-4" /> Mark complete
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={startBreak}
                      className="rounded-xl border border-border px-5 py-2.5 text-sm font-medium text-text transition-colors hover:border-text/20"
                    >
                      Take a break
                    </button>
                  </>
                )}
                {screen === "break-done" && (
                  <button
                    type="button"
                    onClick={() => beginSession("focus", workMinutes)}
                    className="flex items-center gap-2 rounded-xl bg-accent px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent-hover"
                  >
                    <PlayIcon className="h-4 w-4" /> Start next focus
                  </button>
                )}
                <button
                  type="button"
                  onClick={exitZen}
                  className="rounded-xl px-4 py-2.5 text-sm text-text-muted transition-colors hover:text-text"
                >
                  Quit
                </button>
              </div>
            </div>
          ) : (
            <SetupPanel
              tasks={tasks}
              selectedTask={selectedTask}
              onSelectTask={setSelectedTask}
              workMinutes={workMinutes}
              shortMinutes={shortMinutes}
              longMinutes={longMinutes}
              perCycle={perCycle}
              workPresets={WORK_PRESETS}
              shortPresets={BREAK_PRESETS}
              longPresets={LONG_PRESETS}
              cycleOptions={CYCLE_OPTIONS}
              onCustomWork={setWorkCustom}
              onCustomShort={setShortCustom}
              onCustomLong={setLongCustom}
              onCycleCustom={setCycleCustom}
              onStart={() => beginSession("focus", workMinutes)}
            />
          )}
        </div>

        {/* Foot hint */}
        <p className="pointer-events-none text-center text-[11px] text-text-muted/70">
          {mode === "clock"
            ? "Esc exits Zen"
            : screen === "running"
              ? "Space to pause · Esc to quit"
              : screen === "paused"
                ? "Space to resume"
                : "Esc exits Zen"}
        </p>

        {/* Quit confirm */}
        {confirmQuit && (
          <div className="absolute inset-0 z-10 grid place-items-center bg-backdrop/70">
            <div className="w-full max-w-xs rounded-2xl border border-border bg-surface p-6 text-center">
              <p className="mb-1 text-sm font-medium text-text">End focus early?</p>
              <p className="mb-5 text-xs text-text-muted">
                {activeKind === "focus" && serverSessionOpen
                  ? "This session won&rsquo;t count toward your focus time."
                  : "You&rsquo;ll leave Zen and return where you were."}
              </p>
              <div className="flex justify-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setConfirmQuit(false);
                    void skipSession();
                    exitZen();
                  }}
                  className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover"
                >
                  Quit
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmQuit(false)}
                  className="rounded-lg border border-border px-4 py-2 text-sm text-text transition-colors hover:border-text/20"
                >
                  Keep focusing
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AuthGate>
  );
}

function CycleDots({ done, cycle }: { done: number; cycle: number }) {
  return (
    <div className="flex items-center justify-center gap-2" aria-label={`${done} of ${cycle} focus sessions done`}>
      {Array.from({ length: cycle }).map((_, i) => (
        <span
          key={i}
          className={`h-1.5 w-1.5 rounded-full transition-colors ${
            i < done ? "bg-accent" : "bg-text/15"
          }`}
        />
      ))}
    </div>
  );
}

// Hoisted to module scope on purpose: declared inside SetupPanel it would be a
// new component type on every render, so React would unmount and remount the
// presets (and the focused number input) on each keystroke.
function Picker({
  label, value, presets, onChange, min, max,
}: {
  label: string; value: number; presets: number[]; onChange: (n: number | null) => void;
  min: number; max: number;
}) {
  return (
    <label className="block text-xs text-text-muted">
      {label} <span className="text-text-muted/60">(min)</span>
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        {presets.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => onChange(p)}
            className={`rounded-lg px-2.5 py-1 text-xs transition-colors ${
              value === p
                ? "bg-accent text-white"
                : "border border-border text-text-muted hover:text-text"
            }`}
          >
            {p}
          </button>
        ))}
        <input
          type="number"
          min={min}
          max={max}
          value={value}
          onChange={(e) => onChange(e.target.value === "" ? null : +e.target.value)}
          className="w-16 rounded-lg border border-border bg-surface-elevated px-2 py-1 text-xs text-text outline-none focus:border-accent"
        />
      </div>
    </label>
  );
}

function SetupPanel(props: {
  tasks: ZenTask[];
  selectedTask: ZenTask | null;
  onSelectTask: (t: ZenTask | null) => void;
  workMinutes: number;
  shortMinutes: number;
  longMinutes: number;
  perCycle: number;
  workPresets: number[];
  shortPresets: number[];
  longPresets: number[];
  cycleOptions: number[];
  onCustomWork: (n: number | null) => void;
  onCustomShort: (n: number | null) => void;
  onCustomLong: (n: number | null) => void;
  onCycleCustom: (n: number | null) => void;
  onStart: () => void;
}) {
  const {
    tasks, selectedTask, onSelectTask, workMinutes, shortMinutes, longMinutes, perCycle,
    workPresets, shortPresets, longPresets, cycleOptions,
    onCustomWork, onCustomShort, onCustomLong, onCycleCustom, onStart,
  } = props;

  return (
    <div className="w-full max-w-xl space-y-6">
      <div className="text-center">
        <h1 className="text-3xl font-semibold tracking-tight text-text">Focus</h1>
        <p className="mt-1 text-sm text-text-muted">One thing at a time.</p>
      </div>

      <div className="rounded-2xl border border-border/70 bg-surface/80 p-5">
        <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-text-muted">
          What are you focusing on?
        </p>
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => onSelectTask(null)}
            className={`rounded-lg px-3 py-1.5 text-xs transition-colors ${
              !selectedTask ? "bg-accent text-white" : "border border-border text-text-muted hover:text-text"
            }`}
          >
            Just focus
          </button>
          {tasks.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => onSelectTask(t)}
              title={t.notes ?? undefined}
              className={`max-w-[16rem] truncate rounded-lg px-3 py-1.5 text-xs transition-colors ${
                selectedTask?.id === t.id
                  ? "bg-accent text-white"
                  : "border border-border text-text-muted hover:text-text"
              }`}
            >
              {t.title}
            </button>
          ))}
          {tasks.length === 0 && (
            <p className="text-xs text-text-muted">No open tasks — add one from Tasks, or just focus.</p>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-border/70 bg-surface/80 p-5">
        <p className="mb-4 text-[10px] font-semibold uppercase tracking-[0.2em] text-text-muted">
          Session lengths
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Picker label="Focus" value={workMinutes} presets={workPresets} onChange={onCustomWork} min={1} max={120} />
          <Picker label="Short break" value={shortMinutes} presets={shortPresets} onChange={onCustomShort} min={1} max={60} />
          <Picker label="Long break" value={longMinutes} presets={longPresets} onChange={onCustomLong} min={5} max={120} />
          <label className="block text-xs text-text-muted">
            Sessions per cycle
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              {cycleOptions.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => onCycleCustom(c)}
                  className={`rounded-lg px-2.5 py-1 text-xs transition-colors ${
                    perCycle === c
                      ? "bg-accent text-white"
                      : "border border-border text-text-muted hover:text-text"
                  }`}
                >
                  {c}
                </button>
              ))}
              <input
                type="number"
                min={2}
                max={12}
                value={perCycle}
                onChange={(e) => onCycleCustom(e.target.value === "" ? null : +e.target.value)}
                className="w-16 rounded-lg border border-border bg-surface-elevated px-2 py-1 text-xs text-text outline-none focus:border-accent"
              />
            </div>
          </label>
        </div>
        <p className="mt-3 text-[11px] text-text-muted/70">
          Defaults live in Settings → Notifications. These apply for this session only.
        </p>
      </div>

      <button
        type="button"
        onClick={onStart}
        className="flex w-full items-center justify-center gap-2 rounded-2xl bg-accent py-4 text-base font-medium text-white shadow-lg shadow-accent/20 transition-colors hover:bg-accent-hover"
      >
        <PlayIcon className="h-5 w-5" />
        Start {workMinutes}-minute focus
      </button>
    </div>
  );
}

function goBack(router: ReturnType<typeof useRouter>) {
  if (window.history.length > 1) router.back();
  else router.replace("/");
}