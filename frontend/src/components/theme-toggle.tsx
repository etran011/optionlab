"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { isTheme, SYSTEM_THEME_QUERY, THEME_STORAGE_KEY, type Theme } from "@/lib/theme";

export function ThemeToggle() {
  // The server and first client render share the same neutral state. The head
  // script has already applied the visual theme independently of this button.
  const [theme, setTheme] = useState<Theme | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const preference = useRef<Theme | null>(null);

  useLayoutEffect(() => {
    const system = window.matchMedia(SYSTEM_THEME_QUERY);
    try {
      const saved = localStorage.getItem(THEME_STORAGE_KEY);
      preference.current = isTheme(saved) ? saved : null;
    } catch {
      // Storage may be blocked. System detection and in-session changes work.
      preference.current = null;
    }

    function applyPreference() {
      const resolved = preference.current ?? (system.matches ? "dark" : "light");
      document.documentElement.dataset.theme = resolved;
      setTheme(resolved);
    }

    function syncStorage(event: StorageEvent) {
      if (event.key !== THEME_STORAGE_KEY && event.key !== null) return;
      preference.current = isTheme(event.newValue) ? event.newValue : null;
      setNotice(null);
      applyPreference();
    }

    // Also restores the root attribute if development Strict Mode resets it.
    applyPreference();
    system.addEventListener("change", applyPreference);
    window.addEventListener("storage", syncStorage);
    return () => {
      system.removeEventListener("change", applyPreference);
      window.removeEventListener("storage", syncStorage);
    };
  }, []);

  function toggleTheme() {
    if (theme === null) return;
    const nextTheme = theme === "dark" ? "light" : "dark";
    preference.current = nextTheme;
    document.documentElement.dataset.theme = nextTheme;
    setTheme(nextTheme);
    setNotice(null);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
    } catch {
      setNotice("Theme changed for this visit. Your browser could not save the preference.");
    }
  }

  return (
    <div className="theme-control">
      <button
        type="button"
        className="theme-toggle"
        role="switch"
        aria-label="Dark theme"
        aria-checked={theme === "dark"}
        aria-describedby={notice ? "theme-notice" : undefined}
        title={theme === null ? "Color theme" : `Switch to ${theme === "dark" ? "light" : "dark"} theme`}
        disabled={theme === null}
        onClick={toggleTheme}
      >
        <svg width="15" height="15" viewBox="0 0 20 20" fill="none" aria-hidden="true">
          <circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="1.2" />
          <path d="M10 3a7 7 0 0 1 0 14Z" fill="currentColor" />
        </svg>
        <span>Theme</span>
      </button>
      {notice && <p className="theme-notice" id="theme-notice" role="status">{notice}</p>}
    </div>
  );
}
