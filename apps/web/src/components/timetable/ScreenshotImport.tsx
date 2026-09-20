"use client";

import { useState } from "react";
import {
  DAYS,
  mergeEntriesToCourses,
  parseOcrText,
  timeToMinutes,
} from "@/lib/timetable";
import { UploadIcon } from "@/components/icons";

export interface ReviewedEntry {
  courseName: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
}

interface ScreenshotImportProps {
  onConfirm: (entries: ReviewedEntry[]) => void | Promise<void>;
  onCancel: () => void;
}

type Phase = "pick" | "working" | "review";

export function ScreenshotImport({ onConfirm, onCancel }: ScreenshotImportProps) {
  const [phase, setPhase] = useState<Phase>("pick");
  const [preview, setPreview] = useState<string | null>(null);
  const [entries, setEntries] = useState<ReviewedEntry[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const runOcr = async (file: File) => {
    setPhase("working");
    setError(null);
    setPreview(URL.createObjectURL(file));
    try {
      const Tesseract = (await import("tesseract.js")).default;
      const { data } = await Tesseract.recognize(file, "eng", {
        workerPath: "https://cdn.jsdelivr.net/npm/tesseract.js@7.0.0/dist/worker.min.js",
        corePath: "https://cdn.jsdelivr.net/npm/tesseract.js-core@7.0.0",
      });
      const parsed = parseOcrText(data.text ?? "");
      if (parsed.length === 0) {
        setError("I couldn't find any class times in that image — make sure it shows a weekly timetable with day and time ranges (e.g. “Mon 09:00 – 10:30”).");
        setPhase("pick");
        return;
      }
      setEntries(parsed.map((p) => ({ ...p })));
      setPhase("review");
    } catch (e) {
      setError(e instanceof Error ? e.message : "OCR failed — check your internet connection and try again.");
      setPhase("pick");
    }
  };

  const updateEntry = (i: number, patch: Partial<ReviewedEntry>) => {
    setEntries((prev) => prev.map((e, idx) => (idx === i ? { ...e, ...patch } : e)));
  };

  const confirm = async () => {
    const valid = entries.filter(
      (e) => e.courseName.trim() && timeToMinutes(e.endTime) > timeToMinutes(e.startTime),
    );
    if (valid.length === 0) {
      setError("No usable rows left — add at least one class time.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onConfirm(valid);
      onCancel();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save the timetable.");
    } finally {
      setSaving(false);
    }
  };

  if (phase === "working") {
    return (
      <div className="rounded-2xl border border-border bg-surface p-6">
        <p className="text-sm text-text-muted">Reading the screenshot… OCR may take a few seconds on slow devices.</p>
      </div>
    );
  }

  if (phase === "review") {
    const merged = mergeEntriesToCourses(entries);
    return (
      <div className="space-y-4 rounded-2xl border border-border bg-surface p-5">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-text">Review the timetable</h3>
            <p className="mt-0.5 text-xs text-text-muted">
              Found {mergeEntriesToCourses(entries).length} course{"(s)"} — rows with the same class name become one course
              with that many weekly meetings.
            </p>
          </div>
          {preview && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="Uploaded screenshot" className="h-16 w-16 rounded-lg border border-border object-cover" />
          )}
        </div>

        {error && <p className="text-sm text-danger">{error}</p>}

        <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
          {entries.map((e, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2">
              <input
                value={e.courseName}
                onChange={(ev) => updateEntry(i, { courseName: ev.target.value })}
                className="min-w-0 flex-1 rounded-lg border border-border bg-surface-elevated px-2.5 py-1.5 text-sm text-text outline-none focus:border-accent"
              />
              <select
                value={e.dayOfWeek}
                onChange={(ev) => updateEntry(i, { dayOfWeek: Number(ev.target.value) })}
                className="rounded-lg border border-border bg-surface-elevated px-2 py-1.5 text-sm text-text outline-none focus:border-accent"
              >
                {DAYS.map((d, idx) => (
                  <option key={idx} value={idx}>{d}</option>
                ))}
              </select>
              <input
                type="time"
                value={e.startTime}
                onChange={(ev) => updateEntry(i, { startTime: ev.target.value })}
                className="rounded-lg border border-border bg-surface-elevated px-2 py-1.5 text-sm text-text outline-none focus:border-accent"
              />
              <span className="text-xs text-text-muted">–</span>
              <input
                type="time"
                value={e.endTime}
                onChange={(ev) => updateEntry(i, { endTime: ev.target.value })}
                className="rounded-lg border border-border bg-surface-elevated px-2 py-1.5 text-sm text-text outline-none focus:border-accent"
              />
              <button
                onClick={() => setEntries((prev) => prev.filter((_, idx) => idx !== i))}
                className="rounded p-1.5 text-text-muted transition-colors hover:bg-surface-elevated hover:text-danger"
                aria-label="Remove row"
              >
                ✕
              </button>
            </div>
          ))}
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <button
            onClick={onCancel}
            className="rounded-lg px-4 py-2 text-sm text-text-muted transition-colors hover:bg-surface-elevated"
          >
            Cancel
          </button>
          <button
            onClick={() => void confirm()}
            disabled={saving}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
          >
            {saving ? "Saving…" : `Add ${merged.length} course${merged.length !== 1 ? "s" : ""}`}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-dashed border-border bg-surface/50 p-6">
      {message && <p className="mb-2 text-xs text-text-muted">{message}</p>}
      {error && <p className="mb-2 text-sm text-danger">{error}</p>}
      <label className="flex cursor-pointer flex-col items-center justify-center gap-3 py-2 text-center">
        <UploadIcon className="h-8 w-8 text-text-muted" />
        <span className="text-sm font-medium text-text">Upload a timetable screenshot</span>
        <span className="max-w-sm text-xs text-text-muted">
          A photo or screenshot of your weekly class schedule — the app reads the class names, days and times, then
          fills in your timetable. (OCR needs an internet connection.)
        </span>
        <input
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(ev) => {
            setError(null);
            const file = ev.target.files?.[0];
            if (file) void runOcr(file);
          }}
        />
      </label>
      <div className="mt-3 flex justify-end">
        <button onClick={onCancel} className="rounded-lg px-3 py-1.5 text-xs text-text-muted transition-colors hover:bg-surface-elevated">
          Close
        </button>
      </div>
    </div>
  );
}