import { useEffect, useState } from "react";

/** "Big answer button": a joined player's phone shows only one huge ANSWER button filling the screen. Saved per device. */
const KEY = "tg_big_btn";
const listeners = new Set<() => void>();
export const getBigBtn = () => { try { return localStorage.getItem(KEY) === "1"; } catch { return false; } };
const setBigBtn = (v: boolean) => { try { localStorage.setItem(KEY, v ? "1" : "0"); } catch { /* private mode */ } listeners.forEach((f) => f()); };
export function useBigBtn(): [boolean, (v: boolean) => void] {
  const [v, setV] = useState(getBigBtn);
  useEffect(() => { const f = () => setV(getBigBtn()); listeners.add(f); return () => { listeners.delete(f); }; }, []);
  return [v, setBigBtn];
}
