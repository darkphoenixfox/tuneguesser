import { createRoot } from "react-dom/client";
import { Home } from "./Home";
import { applyTheme, getTheme } from "./theme";
import { startPadNav } from "./input/nav";
import { PadTextEntry } from "./input/PadTextEntry";
import { PadHintBar } from "./input/PadHintBar";
import "./styles.css";

startPadNav();

applyTheme(getTheme());

createRoot(document.getElementById("root")!).render(
  <>
    <div className="bg" aria-hidden><i /><i /><i /></div>
    <Home />
    <PadTextEntry />
    <PadHintBar />
  </>,
);
