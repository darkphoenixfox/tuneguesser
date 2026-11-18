import { useState } from "react";
import { useTheme } from "./theme";

/** Host settings: a gear button that opens a small panel. */
export function HostSettings({ autoAdvance, onAutoAdvance }: { autoAdvance: boolean; onAutoAdvance: (v: boolean) => void }) {
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useTheme();
  return (
    <>
      <button className="gear" onClick={() => setOpen(!open)} aria-label="Settings" aria-expanded={open}>⚙</button>
      {open && (
        <div className="settings card" role="dialog" aria-label="Host settings">
          <h2>Settings</h2>
          <div className="setting">
            <span>Go to the next song automatically after each round (No: hold the answer until the song ends or the host continues)</span>
            <div className="seg">
              <button className={autoAdvance ? "on" : ""} onClick={() => onAutoAdvance(true)}>Yes</button>
              <button className={!autoAdvance ? "on" : ""} onClick={() => onAutoAdvance(false)}>No</button>
            </div>
          </div>
          <div className="setting">
            <span>Theme</span>
            <div className="seg">
              <button className={theme === "dark" ? "on" : ""} onClick={() => setTheme("dark")}>🌙 Dark</button>
              <button className={theme === "light" ? "on" : ""} onClick={() => setTheme("light")}>☀️ Light</button>
            </div>
          </div>
          <button className="btn ghost" onClick={() => setOpen(false)}>Close</button>
        </div>
      )}
    </>
  );
}

/** Small per-device theme toggle (phones and the join screen). */
export function ThemeButton() {
  const [theme, setTheme] = useTheme();
  return <button className="theme-btn" onClick={() => setTheme(theme === "dark" ? "light" : "dark")} aria-label="Toggle theme">{theme === "dark" ? "☀️" : "🌙"}</button>;
}
