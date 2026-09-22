"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Zen replaced the in-app pomodoro page (Phase 4). Keep the old route alive
// so old links/keybindings land somewhere useful.
export default function PomodoroPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/zen");
  }, [router]);
  return null;
}