import { Fragment, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Typewriter from "./typewriter";
import { makeRoom } from "./decay";
import { loadVisit, saveVisit } from "./visit";

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

    fetch("/api/rooms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        room: n,
        answer: visit.answer,
        narration: prev?.narration,
        clicked: prev?.objects[prev.exit].name,
      }),
    })
      .then((response) => {
        if (!response.ok) throw Error(response.statusText);
        return response.json();
      })
      .then((data) => {
        if (ignoreStaleRequest) return;
        const made = makeRoom(data, n, prev, visit.answer);
        visit.rooms[n - 1] = made;
        saveVisit(visit);
        setRoom(made);
      })
      .catch((error) => console.log(error));

    return () => {
      ignoreStaleRequest = true; // cleanup: ignore the response if we unmount first
    };
  }, [n, room]);

  const back = n === 1 ? "/" : `/room/${n - 1}`;

  // Cuts one line of the drawing around the filenames on it, which become
  // the clickable objects.
  function drawLine(line, row) {
    const parts = [];
    let at = 0;
    for (const { col, index } of room.slots.filter((s) => s.row === row)) {
      const object = room.objects[index];
      parts.push(line.slice(at, col));
      parts.push(
        <RoomObject
          key={index}
          object={object}
          href={index === room.exit ? `/room/${n + 1}` : null}
          setNote={setNote}
        ></RoomObject>,
      );
      at = col + object.name.length;
    }
    parts.push(line.slice(at));
    return parts;
  }

  return (
    <main style={{ "--decay": room?.decay ?? 0 }}>
      <title>{`room ${pad(n)} — context window`}</title>
      <h1>~/house $ cd room-{pad(n)}</h1>

      {!room ? (
        <p className="status loading" aria-live="polite">
          drawing room-{pad(n)}
        </p>
      ) : (
        <>
          <Meter decay={room.decay} remembered={room.remembered}></Meter>
          <Typewriter text={room.narration}></Typewriter>

          <pre className={room.decay > 0.6 ? "art unstable" : "art"}>
            {room.art.map((line, row) => (
              <Fragment key={row}>
                {drawLine(line, row)}
                {"\n"}
              </Fragment>
            ))}
          </pre>

          <p className="status" aria-live="polite">
            {note ?? `room ${pad(n)} · ${room.objects.length} files`}
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

// How much of the visit the narrator still holds, and the visitor's answer
// as it now remembers it.
function Meter({ decay, remembered }) {
  const left = Math.round((1 - decay) * 20);
  return (
    <p className="meter">
      context [{"#".repeat(left)}
      <span className="lost">{".".repeat(20 - left)}</span>]{" "}
      {Math.round((1 - decay) * 100)}%
      <br />
      you said: &quot;{remembered}&quot;
    </p>
  );
}

// The exit is a link and dead ends are buttons, but they look the same.
function RoomObject({ object, href, setNote }) {
  if (href) {
    return (
      <Link className="obj" to={href}>
        {object.name}
      </Link>
    );
  }
  return (
    <button
      className="obj"
      onClick={() => setNote(`${object.name}: ${object.note}`)}
    >
      {object.name}
    </button>
  );
}
