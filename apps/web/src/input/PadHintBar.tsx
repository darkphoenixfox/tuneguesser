import { useEffect, useState } from "react";
import { Glyph } from "./Glyph";
import { usePad } from "./pad";
import { t } from "../i18n";

/** Bottom bar on menu screens (not during a round) that tells a gamepad user what the buttons do. */
export function PadHintBar() {
  const { connected } = usePad();
  const [menu, setMenu] = useState(true);
  useEffect(() => {
    const check = () => setMenu(!document.querySelector("[data-pad-game]"));
    check();
    const i = setInterval(check, 300);
    return () => clearInterval(i);
  }, []);
  if (!connected || !menu) return null;
  const tabs = !!document.querySelector(".tabs");
  const quick = !!document.querySelector("[data-pad-quick]");
  return (
    <div className="padbar" aria-hidden>
      <span><b className="dpad">✥</b> {t("Move")}</span>
      <span><Glyph button="a" /> {t("Select")}</span>
      <span><b className="dpad">◀ ▶</b> {t("Change value")}</span>
      {quick && <span><Glyph button="y" /> {t("Quickstart")}</span>}
      {tabs && <span><Glyph button="lb" /><Glyph button="rb" /> {t("Switch tab")}</span>}
    </div>
  );
}
