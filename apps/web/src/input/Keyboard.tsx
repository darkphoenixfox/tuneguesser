import { useEffect, useState } from "react";
import { t } from "../i18n";

/**
 * "On-screen keyboard off": no gamepad keyboard, and answer fields ask the phone not to open its own keyboard
 * (inputmode="none"), so answers come from a physical keyboard or the microphone only. Saved per device.
 */
const KEY = "tg_kb_off";
const listeners = new Set<() => void>();
export const getKbOff = () => { try { return localStorage.getItem(KEY) === "1"; } catch { return false; } };
const setKbOff = (v: boolean) => { try { localStorage.setItem(KEY, v ? "1" : "0"); } catch { /* private mode */ } listeners.forEach((f) => f()); };
export function useKbOff(): [boolean, (v: boolean) => void] {
  const [v, setV] = useState(getKbOff);
  useEffect(() => { const f = () => setV(getKbOff()); listeners.add(f); return () => { listeners.delete(f); }; }, []);
  return [v, setKbOff];
}

/** Round status-bar button: turn the on-screen keyboard off (physical keyboard / microphone only) or back on. */
export function KbToggle({ className }: { className?: string }) {
  const [off, set] = useKbOff();
  return (
    <button className={(className ?? "") + (off ? " on" : "")} onClick={() => set(!off)} aria-pressed={off} aria-label={t("On-screen keyboard")} title={off ? t("On-screen keyboard off: type on a physical keyboard or use the microphone") : t("On-screen keyboard on")}>
      <span style={{ opacity: off ? .45 : 1, position: "relative" }}>⌨{off && <span className="kb-slash" aria-hidden="true" />}</span>
    </button>
  );
}
