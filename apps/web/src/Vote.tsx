import { useState } from "react";
import type { ClientMessage } from "@tuneguesser/shared";
import { t } from "./i18n";

/** Anonymous id of this browser (kept so the vote is recorded once per song). */
function voterId(): string {
  try {
    let id = localStorage.getItem("tg_voter");
    if (!id || !/^[\w-]{8,64}$/.test(id)) {
      id = Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(16).padStart(2, "0")).join("");
      localStorage.setItem("tg_voter", id);
    }
    return id;
  } catch {
    return "anon" + Math.random().toString(36).slice(2, 12);
  }
}

/**
 * "This song has issues" (host / solo screens only): skips the song at once without counting a round
 * and blacklists it for every later game. One vote is enough.
 */
export function VoteButtons({ send }: { round: number; send: (m: ClientMessage) => unknown }) {
  const [sent, setSent] = useState(false);
  return (
    <div className="vote">
      <button type="button" className={sent ? "on down" : ""} disabled={sent} onClick={() => { setSent(true); send({ t: "vote", v: -1, voter: voterId() }); setTimeout(() => setSent(false), 2500); }} /* the next song starts at once: re-arm for it */ title={t("This song has issues.")} aria-label={t("This song has issues.")}>👎</button>
    </div>
  );
}
