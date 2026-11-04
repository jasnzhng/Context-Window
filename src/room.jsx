import { Fragment, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Typewriter from "./typewriter";
import { makeRoom } from "./decay";
import { loadVisit, saveVisit } from "./visit";

const pad = (n) => String(n).padStart(2, "0");

export default function Room({ n }) {
  // A room the visitor has already seen comes back from storage, unchanged.
  const [room, setRoom] = useState(() => loadVisit().rooms[n - 1]);
  // The object whose description is showing; coming back, the one you chose.
  const [selected, setSelected] = useState(() => room?.chosen ?? null);
  const navigate = useNavigate();

  // Otherwise, ask the server for it.
  useEffect(() => {
    if (room) return;
    let ignoreStaleRequest = false;

    const visit = loadVisit();
    const prev = visit.rooms[n - 2];
    const seed = prev?.objects[prev.chosen];

    fetch("/api/rooms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        room: n,
        answer: visit.answer,
        narration: prev?.narration,
        clicked: seed?.name,
        clickedNote: seed?.note,
      }),
    })
      .then((response) => {
        if (!response.ok) throw Error(response.statusText);
        return response.json();
      })
      .then((data) => {
        if (ignoreStaleRequest) return;
        const made = makeRoom(data, prev, seed?.name, visit.answer);
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

  // The chosen object seeds the next room. Choosing a different object than
  // last time abandons the old path: every room after this one is dropped.
  function goFurther() {
    const visit = loadVisit();
    if (visit.rooms[n - 1].chosen !== selected) {
      visit.rooms = visit.rooms.slice(0, n);
      visit.rooms[n - 1].chosen = selected;
      saveVisit(visit);
    }
    navigate(`/room/${n + 1}`);
  }

  // Cuts one line of the drawing around the filenames on it, which become
  // the clickable objects.
  function drawLine(line, row) {
    const parts = [];
    let at = 0;
    for (const { col, index } of room.slots.filter((s) => s.row === row)) {
      const object = room.objects[index];
      parts.push(line.slice(at, col));
      parts.push(
        <button
          key={index}
          className={index === selected ? "obj selected" : "obj"}
          onClick={() => setSelected(index)}
        >
          {object.name}
        </button>,
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
          loading room-{pad(n)}
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

          {selected === null ? (
            <p className="status">
              room {pad(n)} · {room.objects.length} files · open one
            </p>
          ) : (
            <div className="opened" aria-live="polite">
              <p className="status">
                {room.objects[selected].name}: {room.objects[selected].note}
              </p>
              <button className="obj" onClick={goFurther}>
                [go further]
              </button>
            </div>
          )}
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

const FADE = ["▓", "▒", "░"];

// How much of the visit the narrator still holds, and the visitor's answer
// as it now remembers it. The bar fades out at its edge: █▓▒░ then dots.
function Meter({ decay, remembered }) {
  const left = (1 - decay) * 20;
  const bar = Array.from({ length: 20 }, (_, i) => {
    const past = i + 1 - left; // how many cells beyond what's left this one is
    return past <= 0 ? "█" : (FADE[Math.ceil(past) - 1] ?? ".");
  }).join("");
  return (
    <p className="meter">
      context {bar} {Math.round((1 - decay) * 100)}%
      <br />
      you said: &quot;{remembered}&quot;
    </p>
  );
}
