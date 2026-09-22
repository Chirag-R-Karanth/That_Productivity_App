export function wantsReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  if (document.documentElement.classList.contains("reduce-motion")) return true;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}