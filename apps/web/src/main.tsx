import "./storage";
import { createRoot } from "react-dom/client";
import { Home } from "./Home";
import { PlaylistPage } from "./PlaylistPage";
import { applyTheme, getTheme } from "./theme";
import { startPadNav } from "./input/nav";
import { PadTextEntry } from "./input/PadTextEntry";
import { BackHandler } from "./BackHandler";
import { PadHintBar } from "./input/PadHintBar";
import { setLang, useLang } from "./i18n";
import { ErrorBoundary } from "./ErrorBoundary";
import "./styles.css";

// /es, /it and /en: pick that language and land on the main screen
const langPath = /^\/(es|en|it)\/?$/.exec(location.pathname);
if (langPath) { setLang(langPath[1] as "es" | "en" | "it"); history.replaceState(null, "", "/" + location.search); }

const playlistPath = /^\/playlist\/([\w%-]+)\/?$/.exec(location.pathname);

startPadNav();

applyTheme(getTheme());

function App() {
  useLang(); // the whole UI re-renders when the language changes
  return (
    <ErrorBoundary>
      <div className="bg" aria-hidden><i /><i /><i /></div>
      {playlistPath ? <PlaylistPage id={decodeURIComponent(playlistPath[1]!)} /> : <Home />}
      <PadTextEntry />
      <PadHintBar />
      <BackHandler />
    </ErrorBoundary>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
