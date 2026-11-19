import { useLayoutEffect, useRef } from "react";

/** One-line text that scrolls back and forth when it is wider than its box. */
export function Marquee({ text }: { text: string }) {
  const box = useRef<HTMLElement>(null);
  const inner = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const b = box.current, i = inner.current;
    if (!b || !i) return;
    const measure = () => {
      const over = Math.max(0, i.scrollWidth - b.clientWidth);
      b.style.setProperty("--over", `-${over}px`);
      b.style.setProperty("--dur", `${Math.max(4, over / 25 + 3)}s`);
      b.classList.toggle("scrolls", over > 0);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(b);
    return () => ro.disconnect();
  }, [text]);
  return <b className="marquee" ref={box} title={text}><span ref={inner}>{text}</span></b>;
}
