const THEME_KEY = "theme";
const MOTION_KEY = "reduce-motion";

/** Inline <head> script — applies the stored theme before first paint. */
export function themeInitScript() {
  const code = `
(function () {
  try {
    var t = localStorage.getItem("${THEME_KEY}");
    var theme = t === "light" || t === "dark" ? t : (window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark");
    var root = document.documentElement;
    root.classList.add(theme);
    if (localStorage.getItem("${MOTION_KEY}") === "1") root.classList.add("reduce-motion");
  } catch (e) {}
})();
`;
  return code;
}