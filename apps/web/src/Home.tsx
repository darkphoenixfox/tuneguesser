import { useState } from "react";
import { Host } from "./Host";
import { Player } from "./Player";

type Tab = "join" | "host";

function initialTab(): Tab {
  const p = new URLSearchParams(location.search);
  if (location.pathname.startsWith("/host") || p.get("tab") === "host") return "host";
  if (p.get("code")) return "join";
  try {
    if (sessionStorage.getItem("tg_room")) return "host";
    if (localStorage.getItem("tg_player")) return "join";
  } catch { /* storage blocked */ }
  return "join";
}

export function Home() {
  const [tab, setTab] = useState<Tab>(initialTab);
  const [inGame, setInGame] = useState(false);
  const pick = (t: Tab) => { setInGame(false); setTab(t); history.replaceState(null, "", t === "host" ? "/?tab=host" : "/"); };
  return (
    <>
      {!inGame && (
        <nav className="tabs" role="tablist">
          <button role="tab" aria-selected={tab === "join"} className={tab === "join" ? "on" : ""} onClick={() => pick("join")}>Join a game</button>
          <button role="tab" aria-selected={tab === "host"} className={tab === "host" ? "on" : ""} onClick={() => pick("host")}>Host a game</button>
        </nav>
      )}
      {tab === "host" ? <Host onInGame={setInGame} /> : <Player onInGame={setInGame} />}
    </>
  );
}
