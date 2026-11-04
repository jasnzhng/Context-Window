// What the tab does when the visitor looks at another one: the title cycles
// through things the house wants to say, and the favicon becomes a blinking
// eye. Coming back, the tab says so, then goes back to normal. Every leave
// is counted for the panel (see exposed.jsx).
import { getStream } from "./camera.js";

const DOOR = icon(
  `<rect x="10" y="4" width="12" height="24" fill="none" stroke="#8dcf1b" stroke-width="2"/><circle cx="19" cy="17" r="1.5" fill="#8dcf1b"/>`,
);
const EYE = icon(
  `<path d="M3 16 Q16 4 29 16 Q16 28 3 16Z" fill="none" stroke="#8dcf1b" stroke-width="2"/><circle cx="16" cy="16" r="4" fill="#8dcf1b"/>`,
);
const BLINK = icon(
  `<path d="M3 16 Q16 22 29 16" fill="none" stroke="#8dcf1b" stroke-width="2"/>`,
);

function icon(shapes) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" fill="#0b0b0a"/>${shapes}</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function titles() {
  const room = location.pathname.match(/room\/(\d+)/)?.[1];
  const lines = [
    "are you still looking?",
    "(1) new room",
    "you left the door open",
    room
      ? `room ${room.padStart(2, "0")} is forgetting you`
      : "it's still in the other room",
    "come back before we forget",
  ];
  // True, and worth saying: a hidden tab keeps the camera on.
  if (getStream()) lines.push("we can still see you");
  return lines;
}

// Counted for the panel: how many times, and for how long in total.
export const absence = { leaves: 0, totalMs: 0, since: null };

export function startAway() {
  let link = document.querySelector("link[rel~='icon']");
  if (!link) {
    link = document.createElement("link");
    link.rel = "icon";
    document.head.append(link);
  }
  link.href = DOOR;

  let saved = null; // the real title, while it's replaced
  let timer = null;

  document.addEventListener("visibilitychange", () => {
    clearInterval(timer);
    clearTimeout(timer);

    if (document.hidden) {
      saved = document.title;
      absence.leaves += 1;
      absence.since = Date.now();
      const lines = titles();
      let i = 0;
      const step = () => {
        document.title = lines[i % lines.length];
        link.href = i % 2 ? BLINK : EYE;
        i += 1;
      };
      step();
      // Background tabs run timers at most once a second; 2.5 s is safe.
      timer = setInterval(step, 2500);
    } else {
      absence.totalMs += Date.now() - (absence.since ?? Date.now());
      absence.since = null;
      document.title = "you came back";
      link.href = EYE;
      timer = setTimeout(() => {
        document.title = saved;
        link.href = DOOR;
      }, 1800);
    }
  });
}
