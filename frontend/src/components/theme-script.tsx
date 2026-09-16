"use client";

import { themeInitScript } from "@/lib/theme";

export function ThemeScript() {
  return (
    <script
      id="optionlab-theme-init"
      // Execute during HTML parsing only. Client renders (including hot reload)
      // leave this inert; ThemeToggle maintains the root attribute after mount.
      type={typeof window === "undefined" ? "text/javascript" : "text/plain"}
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: themeInitScript }}
    />
  );
}
