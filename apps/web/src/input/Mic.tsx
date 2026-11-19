import { useEffect, useRef, useState } from "react";
import { getLang, t } from "../i18n";

type Native = { canListen?: () => boolean; startListening?: (lang: string) => void; stopListening?: () => void; cancelListening?: () => void };
const nativeBridge = (): Native | undefined => (typeof window === "undefined" ? undefined : (window as any).TuneGuesserApp);

/** The Android app has no browser speech recognition: use the phone's own recognizer through the app (it asks for the microphone permission). */
class NativeRecognition {
  lang = ""; interimResults = true; continuous = false; maxAlternatives = 1;
  onresult: ((e: any) => void) | null = null; onerror: ((e: any) => void) | null = null; onend: (() => void) | null = null;
  start() {
    (window as any).__tgSpeech = (kind: string, text: string) => {
      if (kind === "partial" || kind === "final") this.onresult?.({ results: [[{ transcript: text }]] });
      else if (kind === "error") this.onerror?.({ error: text });
      else if (kind === "end") this.onend?.();
    };
    nativeBridge()!.startListening!(this.lang);
  }
  stop() { nativeBridge()?.stopListening?.(); }
  abort() { nativeBridge()?.cancelListening?.(); }
}

/** Looked up when used (the app injects its bridge after the page script starts). */
const getCtor = (): any => {
  if (typeof window === "undefined") return undefined;
  const b = nativeBridge();
  if (b?.startListening && b.canListen?.()) return NativeRecognition;
  return (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition;
};
export const micSupported = () => !!getCtor();

/** "Voice answers by default": when on, the microphone starts listening as soon as you press ANSWER. Saved per device. */
const KEY = "tg_mic";
const listeners = new Set<() => void>();
export const getMicDefault = () => { try { return localStorage.getItem(KEY) === "1"; } catch { return false; } };
const setMicDefault = (v: boolean) => { try { localStorage.setItem(KEY, v ? "1" : "0"); } catch { /* private mode */ } listeners.forEach((f) => f()); };
export function useMicDefault(): [boolean, (v: boolean) => void] {
  const [v, setV] = useState(getMicDefault);
  useEffect(() => { const f = () => setV(getMicDefault()); listeners.add(f); return () => { listeners.delete(f); }; }, []);
  return [v, setMicDefault];
}

/** Round button for the corner row / header: turn voice answers on by default. */
export function MicToggle({ className }: { className?: string }) {
  const [on, set] = useMicDefault();
  if (!getCtor()) return null;
  return (
    <button className={(className ?? "") + (on ? " on" : "")} onClick={() => set(!on)} aria-pressed={on} aria-label={t("Answer by voice by default")} title={on ? t("Voice answers on: the microphone opens when you press ANSWER") : t("Voice answers off")}>
      <span style={{ opacity: on ? 1 : .45 }}>🎤</span>
    </button>
  );
}

/**
 * Speak the answer (browser speech recognition). Interim words fill the answer box while talking; when the browser has the
 * final text `onFinal` is called. Hidden where the browser has no speech recognition (Firefox).
 */
export function MicButton({ onText, onFinal, disabled }: { onText: (t: string) => void; onFinal: (t: string) => void; disabled?: boolean }) {
  const [on, setOn] = useState(false);
  const [err, setErr] = useState("");
  const rec = useRef<any>();
  const cb = useRef({ onText, onFinal });
  cb.current = { onText, onFinal };
  useEffect(() => () => { try { rec.current?.abort(); } catch { /* already stopped */ } }, []);
  // voice answers by default: start listening when the form appears (the player just pressed ANSWER). The form can mount while
  // `disabled` is still true from the previous attempt, so wait until it is enabled (once per mount).
  const auto = useRef(false);
  useEffect(() => {
    if (!getCtor() || disabled || auto.current || !getMicDefault()) return;
    auto.current = true;
    toggle();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [disabled]);
  if (!getCtor()) return null;

  function toggle() {
    if (on) { rec.current?.stop(); return; }
    setErr("");
    const r = new (getCtor())();
    r.lang = getLang() === "es" ? "es-ES" : navigator.language || "en-US";
    r.interimResults = true;
    r.continuous = false;
    r.maxAlternatives = 1;
    let last = "";
    r.onresult = (e: any) => {
      let t = "";
      for (let i = 0; i < e.results.length; i++) t += e.results[i][0].transcript;
      last = t.trim();
      cb.current.onText(last);
    };
    r.onerror = (e: any) => setErr(e.error === "not-allowed" || e.error === "service-not-allowed" ? t("Microphone blocked: allow it in the browser") : e.error === "no-speech" ? t("Didn't hear anything") : "");
    r.onend = () => { setOn(false); if (last) cb.current.onFinal(last); };
    rec.current = r;
    try { r.start(); setOn(true); } catch {
      // the previous session is still shutting down (second attempt on the same song): try once more shortly
      setOn(false);
      setTimeout(() => { try { r.start(); setOn(true); } catch { /* give up: the player can tap the mic */ } }, 400);
    }
  }

  return (
    <div className="mic-wrap">
      <button type="button" className={"mic" + (on ? " live" : "")} onClick={toggle} disabled={disabled} aria-label={on ? "Stop listening" : "Answer with your voice"} aria-pressed={on} title={on ? "Listening…" : "Answer with your voice"}>🎤</button>
      {err && <small className="error">{err}</small>}
    </div>
  );
}
