import "./storage";
import { createRoot } from "react-dom/client";
import { Home } from "./Home";
import { applyTheme, getTheme } from "./theme";
import { startPadNav } from "./input/nav";
import { PadTextEntry } from "./input/PadTextEntry";
import { BackHandler } from "./BackHandler";
import { PadHintBar } from "./input/PadHintBar";
import { useLang } from "./i18n";
import { ErrorBoundary } from "./ErrorBoundary";
import "./styles.css";

startPadNav();

applyTheme(getTheme());

function App() {
  useLang(); // the whole UI re-renders when the language changes
  return (
    <ErrorBoundary>
      <div className="bg" aria-hidden><i /><i /><i /></div>
      <Home />
      <PadTextEntry />
      <PadHintBar />
      <BackHandler />
    </ErrorBoundary>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
