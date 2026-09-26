// Synthesized flip-clock sounds (no audio files needed). All timers are
// created lazily from a user gesture; the Web Audio API requires that.
import { readStored, writeStored } from "@/lib/storedPref";

const KEY = "prodapp:sound";

let ctx: AudioContext | null = null;
let master: GainNode | null = null;

export const SOUND_KEY = KEY;

/** Stable parser for `useStoredPref`; sound is on unless explicitly "off". */
export function parseSoundPref(raw: string | null): boolean {
  return raw !== "off";
}

export function isSoundEnabled(): boolean {
  return readStored(KEY, parseSoundPref, true);
}

export function setSoundEnabled(on: boolean) {
  // Routed through the store so every mounted `useStoredPref` subscriber
  // updates, including the one in Zen.
  writeStored(KEY, on ? "on" : "off");
  if (on) unlock();
}

export function toggleSound(): boolean {
  const next = !isSoundEnabled();
  setSoundEnabled(next);
  return next;
}

/** Call from a user gesture (click/pointerdown) to satisfy autoplay rules. */
export function unlock() {
  if (!isSoundEnabled()) return;
  try {
    if (!ctx) {
      const AC =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.85;
      master.connect(ctx.destination);
      if (ctx.state === "suspended") void ctx.resume();
    } else if (ctx.state === "suspended") {
      void ctx.resume();
    }
  } catch {
    /* no audio available */
  }
}

function ready(): boolean {
  if (!ctx || !master) return false;
  if (ctx.state !== "running") return false;
  unlock();
  return ctx !== null && master !== null && ctx.state === "running";
}

function t(): number {
  return ctx ? ctx.currentTime : 0;
}

/** Mechanical flip-clock click ("ka-chunk"). */
export function playTick() {
  if (!ready() || !ctx || !master) return;
  const time = t();

  // High, crisp "tick": filtered noise burst.
  const noise = ctx.createBufferSource();
  const buf = ctx.createBuffer(1, ctx.sampleRate * 0.03, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
  noise.buffer = buf;
  const band = ctx.createBiquadFilter();
  band.type = "bandpass";
  band.frequency.value = 2600;
  band.Q.value = 1.2;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, time);
  g.gain.exponentialRampToValueAtTime(0.25, time + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, time + 0.03);
  noise.connect(band).connect(g).connect(master);
  noise.start(time);
  noise.stop(time + 0.04);

  // Low "chunk": thump that drops in pitch.
  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(220, time);
  osc.frequency.exponentialRampToValueAtTime(90, time + 0.06);
  const og = ctx.createGain();
  og.gain.setValueAtTime(0.0001, time);
  og.gain.exponentialRampToValueAtTime(0.22, time + 0.008);
  og.gain.exponentialRampToValueAtTime(0.0001, time + 0.07);
  osc.connect(og).connect(master);
  osc.start(time);
  osc.stop(time + 0.08);
}

/** Soft bell for hourly chime. */
export function playHourChime() {
  if (!ready() || !ctx || !master) return;
  const time = t();
  bell(523.25, time, 0.35, 1.6); // C5
  bell(783.99, time + 0.05, 0.3, 1.9); // G5
}

/** A gentle 3-note rise — played when a focus or break session completes. */
export function playChime() {
  if (!ready() || !ctx || !master) return;
  const time = t();
  bell(523.25, time, 0.4, 1.4); // C5
  bell(659.25, time + 0.16, 0.4, 1.6); // E5
  bell(783.99, time + 0.32, 0.45, 2.2); // G5 (longer tail)
}

function bell(freq: number, start: number, peak: number, decay: number) {
  if (!ctx || !master) return;
  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.value = freq;
  const partial = ctx.createOscillator();
  partial.type = "triangle";
  partial.frequency.value = freq * 2.01;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(peak, start + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, start + decay);
  const pg = ctx.createGain();
  pg.gain.setValueAtTime(0.0001, start);
  pg.gain.exponentialRampToValueAtTime(peak * 0.25, start + 0.015);
  pg.gain.exponentialRampToValueAtTime(0.0001, start + decay * 0.7);
  osc.connect(g);
  partial.connect(pg);
  g.connect(master);
  pg.connect(master);
  osc.start(start);
  partial.start(start);
  osc.stop(start + decay + 0.05);
  partial.stop(start + decay + 0.05);
}