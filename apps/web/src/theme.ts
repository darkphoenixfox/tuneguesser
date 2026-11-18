import { useEffect, useState } from "react";

export type Theme = "dark" | "light";
const KEY = "tg_theme";

export function getTheme(): Theme {
  try { return localStorage.getItem(KEY) === "light" ? "light" : "dark"; } catch { return "dark"; }
}

export function applyTheme(t: Theme) {
  document.documentElement.dataset.theme = t;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", t === "light" ? "#f4f2ff" : "#0b0b1a");
  try { localStorage.setItem(KEY, t); } catch { /* storage blocked */ }
}

export function useTheme(): [Theme, (t: Theme) => void] {
  const [theme, setTheme] = useState<Theme>(getTheme);
  useEffect(() => applyTheme(theme), [theme]);
  return [theme, setTheme];
}
