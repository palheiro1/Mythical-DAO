import { useEffect, useState } from "react";
import { m } from "./i18n";
export type Theme = "system" | "light" | "dark";
export const themeKey = "mythical-dao:theme:v1";
export function ThemePicker() {
  const [theme, setTheme] = useState<Theme>(() => {
    try {
      const value = localStorage.getItem(themeKey);
      if (value === "light" || value === "dark") return value;
    } catch {
      /* Device preference still works. */
    }
    return "system";
  });
  useEffect(() => {
    const media = matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const resolved =
        theme === "system" ? (media.matches ? "dark" : "light") : theme;
      document.documentElement.dataset.theme = resolved;
      document.documentElement.style.colorScheme = resolved;
    };
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [theme]);
  return (
    <label className="theme-control">
      <span className="sr-only">{m("Theme")}</span>
      <select
        aria-label={m("Theme")}
        value={theme}
        onChange={(e) => {
          const value = e.target.value as Theme;
          setTheme(value);
          try {
            localStorage.setItem(themeKey, value);
          } catch {
            /* Selection applies for this visit. */
          }
        }}
      >
        <option value="system">{m("System")}</option>
        <option value="light">{m("Light")}</option>
        <option value="dark">{m("Dark")}</option>
      </select>
    </label>
  );
}
