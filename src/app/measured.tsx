"use client";
// #93: x-charts lays its first pass out at width 0 until it has measured its container, and at
// that width its clip areas come out negative (the margins and the y axis are wider than 0), which
// the browser logs as `<rect> attribute width: A negative value is not valid`. A chart drawn here
// is given its width, and is not drawn at all before the container has one.
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

export default function Measured({ children }: { children: (width: number) => ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const read = () => setWidth(Math.floor(el.getBoundingClientRect().width));
    read();
    if (typeof ResizeObserver === "undefined") return;
    const watch = new ResizeObserver(read);
    watch.observe(el);
    return () => watch.disconnect();
  }, []);
  return <div ref={box}>{width > 0 ? children(width) : null}</div>;
}
