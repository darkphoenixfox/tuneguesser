import { useEffect, useState } from "react";
import { Host } from "./Host";
import { Player } from "./Player";
import { Logo } from "./Logo";
import { SettingsMenu } from "./Settings";
import { PadHint } from "./input/Glyph";
import { t } from "./i18n";

type View = "menu" | "solo" | "host" | "join";

function initialView(): View {
  const p = new URLSearchParams(location.search);
  const tab = p.get("tab");
  if (tab === "solo") return "solo";
  if (location.pathname.startsWith("/host") || tab === "host") return "host";
  if (p.get("code") || tab === "join") return "join";
  try {
    if (sessionStorage.getItem("tg_room")) return sessionStorage.getItem("tg_solo") === "1" ? "solo" : "host";
    if (localStorage.getItem("tg_player")) return "join";
  } catch { /* storage blocked */ }
  return "menu";
}

export function Home() {
  const [view, setView] = useState<View>(initialView);
  useEffect(() => { window.scrollTo(0, 0); }, [view]);
  const go = (v: View) => { setView(v); history.replaceState(null, "", v === "menu" || v === "join" ? "/" : `/?tab=${v}`); };
  const back = () => go("menu");
  if (view === "solo") return <Host solo onBack={back} />;
  if (view === "host") return <Host onBack={back} />;
  if (view === "join") return <Player onBack={back} />;
  return (
    <main className="screen menu">
      <SettingsMenu apk solo />
      <Logo />
      <p className="menu-intro">
        {t("A music quiz: a song starts playing, and you race to guess its title and artist. Play alone or with friends on their phones.")}
        <br />
        {t("Music comes from YouTube (no account needed) or from Spotify (the host needs Premium and Spotify open on a device).")}
      </p>
      <div className="menu-buttons">
        <button className="btn big" data-pad-first onClick={() => go("solo")}>{t("Solo Play")}<PadHint button="a" focusOnly /></button>
        <button className="btn big" onClick={() => go("host")}>{t("Host a game")}<PadHint button="a" focusOnly /></button>
        <button className="btn big" onClick={() => go("join")}>{t("Join a game")}<PadHint button="a" focusOnly /></button>
      </div>
    </main>
  );
}
