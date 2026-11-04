import { useEffect, useState } from "react";

const reduceMotion = window.matchMedia(
  "(prefers-reduced-motion: reduce)",
).matches;

export default function Typewriter({ text }) {
  const [shown, setShown] = useState(reduceMotion ? text.length : 0);

  // One more character every 20 ms.
  useEffect(() => {
    if (shown >= text.length) return;
    const timer = setTimeout(() => setShown(shown + 1), 20);
    return () => clearTimeout(timer);
  }, [shown, text.length]);

  // Any click or keypress finishes it.
  useEffect(() => {
    const finish = () => setShown(text.length);
    document.addEventListener("click", finish);
    document.addEventListener("keydown", finish);
    return () => {
      document.removeEventListener("click", finish);
      document.removeEventListener("keydown", finish);
    };
  }, [text.length]);

  // The untyped rest is invisible but keeps its space, so nothing below jumps.
  return (
    <p>
      {text.slice(0, shown)}
      <span className="ghost">{text.slice(shown)}</span>
    </p>
  );
}
