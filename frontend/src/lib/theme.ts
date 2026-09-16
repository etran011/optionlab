export type Theme = "light" | "dark";

export const THEME_STORAGE_KEY = "optionlab-theme";
export const SYSTEM_THEME_QUERY = "(prefers-color-scheme: dark)";

export function isTheme(value: unknown): value is Theme {
  return value === "light" || value === "dark";
}

// Static application code only. This runs synchronously in <head>, before the
// body is painted or React hydrates; do not defer it with next/script.
export const themeInitScript = `(() => {
  let saved;
  try { saved = localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)}); } catch {}
  const theme = saved === 'light' || saved === 'dark'
    ? saved
    : window.matchMedia(${JSON.stringify(SYSTEM_THEME_QUERY)}).matches ? 'dark' : 'light';
  document.documentElement.dataset.theme = theme;
})();`;
