import { useState } from "react";
import { useTheme } from "./theme";

/** Top-right settings button and panel. The same on every screen; `apk` adds the Android app download (main screens only). */
export function SettingsMenu({ apk, solo }: { apk?: boolean; solo?: boolean }) {
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useTheme();
  const inApp = typeof window !== "undefined" && !!(window as unknown as { TuneGuesserApp?: unknown }).TuneGuesserApp;
  return (
    <>
      <button className={"gear" + (solo ? " solo" : "")} onClick={() => setOpen(!open)} aria-label="Settings" aria-expanded={open} title="Settings">⚙</button>
      {open && (
        <div className={"settings card" + (solo ? " solo" : "")} role="dialog" aria-label="Settings">
          <h2>Settings</h2>
          <div className="setting">
            <span>Theme</span>
            <div className="seg">
              <button className={theme === "dark" ? "on" : ""} onClick={() => setTheme("dark")}>🌙 Dark</button>
              <button className={theme === "light" ? "on" : ""} onClick={() => setTheme("light")}>☀️ Light</button>
            </div>
          </div>
          {apk && !inApp && <a className="btn ghost" href="/tuneguesser.apk" download>⬇ Download the Android app (APK)</a>}
          <button className="btn ghost" onClick={() => setOpen(false)}>Close</button>
        </div>
      )}
    </>
  );
}

/** Small per-device theme toggle (phone game header). */
export function ThemeButton() {
  const [theme, setTheme] = useTheme();
  return <button className="theme-btn" onClick={() => setTheme(theme === "dark" ? "light" : "dark")} aria-label="Toggle theme">{theme === "dark" ? "☀️" : "🌙"}</button>;
}
