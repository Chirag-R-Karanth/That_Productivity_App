"use client";

import { useEffect, useRef } from "react";
import { animate } from "animejs";

interface RevealProps {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}

/** Staggered fade-up entrance used for dashboard sections. */
export function Reveal({ children, delay = 0, className }: RevealProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const anim = animate(el, {
      opacity: [0, 1],
      translateY: [12, 0],
      duration: 500,
      delay,
      ease: "outCubic",
    });
    return () => {
      anim.pause();
    };
  }, [delay]);

  return (
    <div ref={ref} className={className} style={{ opacity: 0 }}>
      {children}
    </div>
  );
}