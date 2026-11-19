import { useState } from "react";
import type { ClientMessage } from "@tuneguesser/shared";
import { t } from "./i18n";

/** Anonymous id of this browser, so one browser counts once per song. */
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

/** Thumbs up/down for the song of this round (host / solo screens only). A thumbs down skips the song at once without counting a round; more than 3 thumbs down (from different hosts) and the song is never played again. */
export function VoteButtons({ round, send }: { round: number; send: (m: ClientMessage) => unknown }) {
  const [vote, setVote] = useState<{ round: number; v: 1 | -1 } | null>(null);
  const mine = vote && vote.round === round ? vote.v : 0;
  const cast = (v: 1 | -1) => {
    const next = mine === v ? 0 : v; // tapping again takes the vote back
    setVote(next ? { round, v: next } : null);
    send({ t: "vote", v: next, voter: voterId() });
  };
  return (
    <div className="vote" role="group" aria-label={t("Rate this song")}>
      <button type="button" className={mine === 1 ? "on" : ""} aria-pressed={mine === 1} onClick={() => cast(1)} title={t("Good pick")}>👍</button>
      <button type="button" className={mine === -1 ? "on down" : ""} aria-pressed={mine === -1} onClick={() => cast(-1)} title={t("Bad match: skip this song (no round counted); more than 3 thumbs down remove it for good")}>👎</button>
    </div>
  );
}
