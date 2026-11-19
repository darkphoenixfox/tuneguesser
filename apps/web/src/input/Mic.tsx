import { useEffect, useRef, useState } from "react";

const Ctor: any = typeof window === "undefined" ? undefined : (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition;
export const micSupported = !!Ctor;

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
  if (!Ctor) return null;

  const toggle = () => {
    if (on) { rec.current?.stop(); return; }
    setErr("");
    const r = new Ctor();
    r.lang = navigator.language || "en-US";
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
    r.onerror = (e: any) => setErr(e.error === "not-allowed" || e.error === "service-not-allowed" ? "Microphone blocked: allow it in the browser" : e.error === "no-speech" ? "Didn't hear anything" : "");
    r.onend = () => { setOn(false); if (last) cb.current.onFinal(last); };
    rec.current = r;
    try { r.start(); setOn(true); } catch { setOn(false); }
  };

  return (
    <div className="mic-wrap">
      <button type="button" className={"mic" + (on ? " live" : "")} onClick={toggle} disabled={disabled} aria-label={on ? "Stop listening" : "Answer with your voice"} aria-pressed={on} title={on ? "Listening…" : "Answer with your voice"}>🎤</button>
      {err && <small className="error">{err}</small>}
    </div>
  );
}
