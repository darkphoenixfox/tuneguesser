import { createRoot } from "react-dom/client";
import { Host } from "./Host";
import { Player } from "./Player";
import "./styles.css";

const path = location.pathname;
createRoot(document.getElementById("root")!).render(
  <>
    <div className="bg" aria-hidden><i /><i /><i /></div>
    {path.startsWith("/host") ? <Host /> : <Player />}
  </>,
);
