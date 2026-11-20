import { useState, type ReactNode } from "react";
import { useTheme } from "./theme";
import { LANGS, getLang, setLang, t, useLang } from "./i18n";
import { useMute } from "./sfx";
import { micSupported, useMicDefault } from "./input/Mic";
import { useKbOff } from "./input/Keyboard";

const FLAGS: Record<string, string> = { en: "🇬🇧", es: "🇪🇸", it: "🇮🇹" };

/** One option of the settings panel: icon + label on the left, its control on the right. */
export function SettingRow({ icon, label, hint, children }: { icon: ReactNode; label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="setting row">
      <span className="set-label"><i className="set-icon" aria-hidden="true">{icon}</i><span>{label}{hint && <small>{hint}</small>}</span></span>
      {children}
    </div>
  );
}

/** On / Off switch for a settings row. */
export function OnOff({ on, set, onIcon = "✓", offIcon = "✕" }: { on: boolean; set: (v: boolean) => void; onIcon?: string; offIcon?: string }) {
  return (
    <div className="seg">
      <button className={on ? "on" : ""} aria-pressed={on} onClick={() => set(true)}>{onIcon} {t("On")}</button>
      <button className={!on ? "on" : ""} aria-pressed={!on} onClick={() => set(false)}>{offIcon} {t("Off")}</button>
    </div>
  );
}

/**
 * The single top-right ⚙ button of every screen, and the panel it opens: theme, language, sound, voice answers,
 * on-screen keyboard, plus whatever the screen adds (`children`: Spotify device, music on this phone…).
 * `apk` adds the Android app download (main screens only).
 */
export function SettingsMenu({ apk, solo, children }: { apk?: boolean; solo?: boolean; children?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useTheme();
  const [mute, setMute] = useMute();
  const [mic, setMic] = useMicDefault();
  const [kbOff, setKbOff] = useKbOff();
  useLang();
  const inApp = typeof window !== "undefined" && !!(window as unknown as { TuneGuesserApp?: unknown }).TuneGuesserApp;
  return (
    <>
      <button className={"gear" + (solo ? " solo" : "") + (open ? " on" : "")} onClick={() => setOpen(!open)} aria-label={t("Settings")} aria-expanded={open} title={t("Settings")}>⚙</button>
      {open && (
        <div className={"settings card" + (solo ? " solo" : "")} role="dialog" aria-label={t("Settings")}>
          <h2>⚙ {t("Settings")}</h2>
          <SettingRow icon="🎨" label={t("Theme")}>
            <div className="seg">
              <button className={theme === "dark" ? "on" : ""} onClick={() => setTheme("dark")}>🌙 {t("Dark")}</button>
              <button className={theme === "light" ? "on" : ""} onClick={() => setTheme("light")}>☀️ {t("Light")}</button>
            </div>
          </SettingRow>
          <SettingRow icon="🌐" label={t("Language")}>
            <div className="seg">
              {LANGS.map(([code, name]) => <button key={code} className={getLang() === code ? "on" : ""} onClick={() => setLang(code)}>{FLAGS[code] ?? ""} {name}</button>)}
            </div>
          </SettingRow>
          <SettingRow icon={mute ? "🔇" : "🔊"} label={t("Sound")}><OnOff on={!mute} set={(on) => setMute(!on)} onIcon="🔊" offIcon="🔇" /></SettingRow>
          {micSupported() && <SettingRow icon="🎤" label={t("Voice answers")} hint={t("The microphone opens when you press ANSWER")}><OnOff on={mic} set={setMic} /></SettingRow>}
          <SettingRow icon="⌨️" label={t("On-screen keyboard")} hint={t("Off: physical keyboard or microphone only")}><OnOff on={!kbOff} set={(on) => setKbOff(!on)} /></SettingRow>
          {children}
          {apk && !inApp && <a className="btn ghost" href="/tuneguesser.apk" download>{t("⬇ Download the Android app (APK)")}</a>}
          <button className="btn ghost" onClick={() => setOpen(false)}>✕ {t("Close")}</button>
        </div>
      )}
    </>
  );
}

/** Language dropdown next to the settings button (main screen). */
export function LangSelect() {
  useLang();
  return (
    <select className="langsel" value={getLang()} onChange={(e) => setLang(e.target.value as typeof LANGS[number][0])} aria-label={t("Language")} title={t("Language")}>
      {LANGS.map(([code, name]) => <option key={code} value={code}>{FLAGS[code] ?? "🌐"} {name}</option>)}
    </select>
  );
}
