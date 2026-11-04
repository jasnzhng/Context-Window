import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Typewriter from "./typewriter";
import { makeRoom } from "./decay";
import { loadVisit, saveVisit } from "./visit";
import config from "../config.json";

const pad = (n) => String(n).padStart(2, "0");

export default function Room({ n }) {
  // A room the visitor has already seen comes back from storage, unchanged.
  const [room, setRoom] = useState(() => loadVisit().rooms[n - 1]);
  const [note, setNote] = useState(null);

  // Otherwise, ask the server for it.
  useEffect(() => {
    if (room) return;
    let ignoreStaleRequest = false;

    const visit = loadVisit();
    const prev = visit.rooms[n - 2];
    const clicked = prev?.objects[prev.exit].name;

    fetch("/api/rooms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        room: n,
        answer: visit.answer,
        narration: prev?.narration,
        clicked,
      }),
    })
      .then((response) => {
        if (!response.ok) throw Error(response.statusText);
        return response.json();
      })
      .then((data) => {
        if (ignoreStaleRequest) return;
        const made = makeRoom(data, n, config.rooms, clicked);
        visit.rooms[n - 1] = made;
        saveVisit(visit);
        setRoom(made);
      })
      .catch((error) => console.log(error));

    return () => {
      ignoreStaleRequest = true; // cleanup: ignore the response if we unmount first
    };
  }, [n, room]);

  const next = n < config.rooms ? `/room/${n + 1}` : "/end";
  const back = n === 1 ? "/" : `/room/${n - 1}`;

  return (
    <main>
      <title>{`room ${pad(n)} — context window`}</title>
      <h1>~/house $ cd room-{pad(n)}</h1>

      {!room ? (
        <p className="status">...</p>
      ) : (
        <>
          <Typewriter text={room.narration}></Typewriter>

          {/* Split keeps the "[N] + 17 spaces" slots, which become objects. */}
          <pre>
            {room.frame.split(/(\[\d\] {17})/).map((part, i) => {
              if (!part.startsWith("[")) return part;
              const index = Number(part[1]);
              const object = room.objects[index];
              if (!object) return " ".repeat(20);
              return (
                <RoomObject
                  key={i}
                  object={object}
                  href={index === room.exit ? next : null}
                  setNote={setNote}
                ></RoomObject>
              );
            })}
          </pre>

          <p className="status" aria-live="polite">
            {note ??
              `room ${pad(n)}/${pad(config.rooms)} · ${room.objects.length} files`}
          </p>
          <footer>
            <Link to={back}>cd ..</Link>
            {room.cameThrough && (
              <span>you came through: {room.cameThrough}</span>
            )}
          </footer>
        </>
      )}
    </main>
  );
}

// The exit is a link and dead ends are buttons, but they look the same.
function RoomObject({ object, href, setNote }) {
  const padding = " ".repeat(20 - object.name.length);
  if (href) {
    return (
      <>
        <Link className="obj" to={href}>
          {object.name}
        </Link>
        {padding}
      </>
    );
  }
  return (
    <>
      <button
        className="obj"
        onClick={() => setNote(`${object.name}: ${object.note}`)}
      >
        {object.name}
      </button>
      {padding}
    </>
  );
}
