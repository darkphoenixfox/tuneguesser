import { useState } from "react";
import { useTheme } from "./theme";
import { LANGS, getLang, setLang, t, useLang } from "./i18n";

/** Top-right settings button and panel. The same on every screen; `apk` adds the Android app download (main screens only). */
export function SettingsMenu({ apk, solo }: { apk?: boolean; solo?: boolean }) {
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useTheme();
  useLang();
  const inApp = typeof window !== "undefined" && !!(window as unknown as { TuneGuesserApp?: unknown }).TuneGuesserApp;
  return (
    <>
      <button className={"gear" + (solo ? " solo" : "")} onClick={() => setOpen(!open)} aria-label={t("Settings")} aria-expanded={open} title={t("Settings")}>⚙</button>
      {open && (
        <div className={"settings card" + (solo ? " solo" : "")} role="dialog" aria-label={t("Settings")}>
          <h2>{t("Settings")}</h2>
          <div className="setting">
            <span>{t("Theme")}</span>
            <div className="seg">
              <button className={theme === "dark" ? "on" : ""} onClick={() => setTheme("dark")}>🌙 {t("Dark")}</button>
              <button className={theme === "light" ? "on" : ""} onClick={() => setTheme("light")}>☀️ {t("Light")}</button>
            </div>
          </div>
          <div className="setting">
            <span>{t("Language")}</span>
            <div className="seg">
              {LANGS.map(([code, name]) => <button key={code} className={getLang() === code ? "on" : ""} onClick={() => setLang(code)}>{name}</button>)}
            </div>
          </div>
          {apk && !inApp && <a className="btn ghost" href="/tuneguesser.apk" download>{t("⬇ Download the Android app (APK)")}</a>}
          <button className="btn ghost" onClick={() => setOpen(false)}>{t("Close")}</button>
        </div>
      )}
    </>
  );
}

/** Small per-device theme toggle (phone game header). */
export function ThemeButton() {
  const [theme, setTheme] = useTheme();
  return <button className="theme-btn" onClick={() => setTheme(theme === "dark" ? "light" : "dark")} aria-label={t("Toggle theme")}>{theme === "dark" ? "☀️" : "🌙"}</button>;
}
