import type { Found } from "@tuneguesser/shared";
import { useCountdown } from "./net";

/** What has been guessed so far this round (shown to everyone while the music continues). */
export function FoundChips({ found }: { found?: Found }) {
  return (
    <div className="found">
      <div className={"chip" + (found?.title ? " got" : "")}>
        <small>Song</small>
        <b>{found?.title ? found.title.text : "? ? ? ? ?"}</b>
        {found?.title && <em>{found.title.by}</em>}
      </div>
      <div className={"chip" + (found?.artist ? " got" : "")}>
        <small>Artist</small>
        <b>{found?.artist ? found.artist.text : "? ? ? ? ?"}</b>
        {found?.artist && <em>{found.artist.by}</em>}
      </div>
    </div>
  );
}

/** Shrinking bar: how long the guesser has left to send their answer. */
export function GuessBar({ endsAt, totalMs }: { endsAt: number; totalMs: number }) {
  const left = useCountdown(endsAt);
  return <div className="bar-time"><i style={{ width: `${Math.min(100, (left * 1000 / totalMs) * 100)}%` }} /></div>;
}
