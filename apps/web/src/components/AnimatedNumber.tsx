"use client";

import { useEffect, useRef } from "react";
import { animate } from "animejs";
import { wantsReducedMotion } from "@/lib/motion";

interface AnimatedNumberProps {
  value: number;
  duration?: number;
  className?: string;
  format?: (v: number) => string;
}

/**
 * Count-up on mount / value change using anime.js. Used for analytics numbers
 * across the dashboard (tasks done, focus minutes, attendance %).
 */
export function AnimatedNumber({
  value,
  duration = 900,
  className,
  format = (v) => String(v),
}: AnimatedNumberProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const prevRef = useRef<number>(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (wantsReducedMotion()) {
      prevRef.current = value;
      el.textContent = format(value);
      return;
    }

    const from = prevRef.current;
    prevRef.current = value;

    let current = from;
    const anim = animate(
      { v: from },
      {
        v: value,
        duration,
        ease: "outQuart",
        modifier: (v) => {
          current = Math.round(v);
          return current;
        },
        onUpdate: () => {
          el.textContent = format(current);
        },
        onTick: () => {
          el.textContent = format(current);
        },
      },
    );

    return () => {
      anim.pause();
    };
  }, [value, duration, format]);

  return <span ref={ref} className={className}>{format(value)}</span>;
}