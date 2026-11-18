import { createRoot } from "react-dom/client";
import { Home } from "./Home";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <>
    <div className="bg" aria-hidden><i /><i /><i /></div>
    <Home />
  </>,
);
