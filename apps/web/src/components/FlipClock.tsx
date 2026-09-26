"use client";

// One clock digit card. Renders the current value with split top and bottom halves.
function FlipDigit({ value }: { value: number }) {
  const cur = String(value % 10);

  return (
    <div className="flip-digit">
      <span className="flip-card-top"><span className="flip-glyph">{cur}</span></span>
      <span className="flip-card-bottom"><span className="flip-glyph">{cur}</span></span>
    </div>
  );
}

function DigitGroup({ value }: { value: number }) {
  return (
    <div className="flex gap-[0.1em]">
      <FlipDigit value={Math.floor(value / 10)} />
      <FlipDigit value={value % 10} />
    </div>
  );
}

function Colon() {
  return <span className="flex h-[1em] items-center justify-center px-[0.18em] font-light text-text-muted/80">:</span>;
}

interface FlipClockProps {
  /** Remaining seconds (countdown) or seconds-elapsed-since-midnight (clock face). */
  seconds: number;
  /** Clock-face mode: 12-hour HH:MM, no seconds, with an AM/PM tag. */
  twelveHour?: boolean;
}

export function FlipClock({ seconds, twelveHour = false }: FlipClockProps) {
  const safe = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(safe / 3600);
  const mins = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;

  if (twelveHour) {
    const h12 = hours % 12 === 0 ? 12 : hours % 12;
    const period = hours < 12 ? "AM" : "PM";
    return (
      <div
        className="flex items-start font-mono font-bold tabular-nums tracking-tight text-text"
        role="timer"
        aria-label={`${h12}:${String(mins).padStart(2, "0")} ${period}`}
      >
        <DigitGroup value={h12} />
        <Colon />
        <DigitGroup value={mins} />
        <span className="flex h-[1em] items-center justify-start pl-[0.35em] text-[0.24em] font-semibold tracking-[0.25em] text-text-muted">
          {period}
        </span>
      </div>
    );
  }

  return (
    <div
      className="flex items-start font-mono font-bold tabular-nums tracking-tight text-text"
      role="timer"
      aria-label={`${Math.floor(safe / 60)} minutes ${safe % 60} seconds remaining`}
    >
      {hours > 0 && (
        <>
          <DigitGroup value={hours} />
          <Colon />
          <DigitGroup value={mins} />
          <Colon />
          <DigitGroup value={secs} />
        </>
      )}
      {hours === 0 && (
        <>
          <DigitGroup value={mins} />
          <Colon />
          <DigitGroup value={secs} />
        </>
      )}
    </div>
  );
}