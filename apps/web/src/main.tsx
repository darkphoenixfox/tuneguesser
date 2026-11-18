import { createRoot } from "react-dom/client";
import { Home } from "./Home";
import { applyTheme, getTheme } from "./theme";
import "./styles.css";

applyTheme(getTheme());

createRoot(document.getElementById("root")!).render(
  <>
    <div className="bg" aria-hidden><i /><i /><i /></div>
    <Home />
  </>,
);
