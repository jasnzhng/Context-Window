import { useState } from "react";
import Typewriter from "./typewriter";

const pad = (n) => String(n).padStart(2, "0");

export default function Room({ page }) {
  const [status, setStatus] = useState(
    `room ${pad(page.room)}/${pad(page.total)} · ${page.objects.length} files`,
  );
  const back =
    page.room === 1 ? "index.html" : `room-${pad(page.room - 1)}.html`;

  return (
    <main>
      <h1>~/house $ cd room-{pad(page.room)}</h1>
      <Typewriter text={page.narration}></Typewriter>

      {/* Split keeps the "[N] + 17 spaces" slots, which become objects. */}
      <pre>
        {page.frame.split(/(\[\d\] {17})/).map((part, i) => {
          if (!part.startsWith("[")) return part;
          const object = page.objects[part[1]];
          if (!object) return " ".repeat(20);
          return (
            <RoomObject
              key={i}
              object={object}
              setStatus={setStatus}
            ></RoomObject>
          );
        })}
      </pre>

      <p className="status" aria-live="polite">
        {status}
      </p>
      <footer>
        <a href={back}>cd ..</a>
        {page.cameThrough && <span>you came through: {page.cameThrough}</span>}
      </footer>
    </main>
  );
}

// The exit is a link and dead ends are buttons, but they look the same.
function RoomObject({ object, setStatus }) {
  const padding = " ".repeat(20 - object.name.length);
  if (object.href) {
    return (
      <>
        <a className="obj" href={object.href}>
          {object.name}
        </a>
        {padding}
      </>
    );
  }
  return (
    <>
      <button
        className="obj"
        onClick={() => setStatus(`${object.name}: ${object.note}`)}
      >
        {object.name}
      </button>
      {padding}
    </>
  );
}
