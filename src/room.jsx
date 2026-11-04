import { Fragment, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Typewriter from "./typewriter";
import CheckIn, { nextQuestion } from "./checkin";
import { forget, makeRoom } from "./decay";
import { snapFrame } from "./camera";
import { loadVisit, saveVisit } from "./visit";
import { placeAt } from "./location.js";
import { onPresence, getPresence } from "./presence.js";

const pad = (n) => String(n).padStart(2, "0");

export default function Room({ n }) {
  // A room the visitor has already seen comes back from storage, unchanged.
  const [room, setRoom] = useState(() => loadVisit().rooms[n - 1]);
  // The object whose description is showing; coming back, the one you chose.
  const [selected, setSelected] = useState(() => room?.chosen ?? null);
  // While the house is asking something: { question, choices, reply }.
  const [checkIn, setCheckIn] = useState(null);
  const navigate = useNavigate();

  // Otherwise, ask the server for it.
  useEffect(() => {
    if (room) return;
    let ignoreStaleRequest = false;

    const visit = loadVisit();
    const prev = visit.rooms[n - 2];
    const seed = prev?.objects[prev.chosen];

    // Room 1 takes one picture of the visitor first, if they let us peek, so
    // the house can start out looking like where they really are.
    const snap = n === 1 && visit.peek ? snapFrame() : Promise.resolve(null);

    snap
      .then((photo) =>
        fetch("/api/rooms", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            room: n,
            answer: visit.answer,
            importance: visit.importance,
            narration: prev?.narration,
            clicked: seed?.name,
            clickedNote: seed?.note,
            // Told as precisely as the last room remembered; room 1 gets it all.
            where: placeAt(visit.where, prev?.context ?? 1),
            carrying: visit.bring,
            photo,
          }),
        }),
      )
      .then((response) => {
        if (!response.ok) throw Error(response.statusText);
        return response.json();
      })
      .then((data) => {
        if (ignoreStaleRequest) return;
        const made = makeRoom(data, prev, seed?.name, visit.answer);
        made.where = placeAt(visit.where, data.context);
        visit.rooms[n - 1] = made;
        delete visit.bring; // it's in this room now
        saveVisit(visit);
        setRoom(made);
      })
      .catch((error) => console.log(error));

    return () => {
      ignoreStaleRequest = true; // cleanup: ignore the response if we unmount first
    };
  }, [n, room]);

  const back = n === 1 ? "/" : `/room/${n - 1}`;

  const next = `/room/${n + 1}`;
  const close = () => setCheckIn(null);

  // The house watches through the camera (presence.js). A second face, it
  // asks about once per visit. Looking away is uninterested.jsx's.
  useEffect(() => {
    if (!room || checkIn) return;
    return onPresence(() => {
      if (getPresence().faces > 1) {
        const visit = loadVisit();
        if (visit.askedCompany) return;
        visit.askedCompany = true;
        saveVisit(visit);
        setCheckIn({
          question: "who is that with you?",
          choices: [
            { label: "no one", onPick: close },
            { label: "a friend", onPick: close },
          ],
        });
      }
    });
  }, [room, checkIn]);

  // Asked once, at the first check-in: what's on their clipboard. Whatever
  // they show becomes an object in the next room.
  function askClipboard() {
    const say = (reply) => {
      setCheckIn((c) => ({ ...c, reply }));
      setTimeout(() => navigate(next), 2600);
    };
    navigator.clipboard
      .readText()
      .then((text) => {
        const held = text.trim().slice(0, 300);
        if (!held) return say("> your hands are empty. we'll go on.");
        const visit = loadVisit();
        visit.carrying = held;
        visit.bring = held;
        saveVisit(visit);
        const short = held.length > 60 ? `${held.slice(0, 60)}...` : held;
        say(`> "${short}". we'll bring it in with us.`);
      })
      .catch(() => say("> you won't let go of it. that's fine."));
  }

  // The chosen object seeds the next room. Choosing a different object than
  // last time abandons the old path: every room after this one is dropped.
  // Before a new room is generated, now and then (never two rooms running)
  // the house stops to check on the visitor first.
  function goFurther() {
    const visit = loadVisit();
    // Once the house has seen the clipboard, it fills it: you leave carrying
    // a worn copy of what you went through, and it's what you paste next.
    if (visit.askedClipboard) {
      const object = room.objects[selected];
      navigator.clipboard
        ?.writeText(`${object.name}: ${forget(object.note, room.decay / 2)}`)
        .catch(() => {});
    }
    if (visit.rooms[n - 1].chosen === selected) return navigate(next);

    visit.rooms = visit.rooms.slice(0, n);
    visit.rooms[n - 1].chosen = selected;
    // The chance starts at 30% one room after the last check-in and climbs
    // 20% for every room without one, so it's certain by the fifth.
    const since = n - (visit.lastCheckIn ?? 0);
    const due = since >= 2 && Math.random() < 0.3 + 0.2 * (since - 2);
    const clipboard = due && !visit.askedClipboard && navigator.clipboard;
    const question = due && !clipboard ? nextQuestion(visit) : null;
    if (due) visit.lastCheckIn = n;
    if (clipboard) visit.askedClipboard = true;
    saveVisit(visit);

    const onward = () => navigate(next);
    if (clipboard) {
      setCheckIn({
        question: "what are you holding? show us and we'll bring it in.",
        choices: [
          { label: "show us", onPick: askClipboard },
          { label: "no", onPick: onward },
        ],
      });
    } else if (due) {
      setCheckIn({
        question,
        choices: [
          { label: "yes", onPick: onward },
          { label: "no", onPick: onward },
        ],
      });
    } else onward();
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
          <Meter
            context={room.context}
            remembered={room.remembered}
            where={room.where}
          ></Meter>
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
          {checkIn && <CheckIn key={checkIn.question} {...checkIn}></CheckIn>}
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
function Meter({ context, remembered, where }) {
  const left = context * 20;
  const bar = Array.from({ length: 20 }, (_, i) => {
    const past = i + 1 - left; // how many cells beyond what's left this one is
    return past <= 0 ? "█" : (FADE[Math.ceil(past) - 1] ?? ".");
  }).join("");
  return (
    <p className="meter">
      context {bar} {Math.round(context * 100)}%
      <br />
      you said: &quot;{remembered}&quot;
      {where && (
        <>
          <br />
          you are: {where}
        </>
      )}
    </p>
  );
}
