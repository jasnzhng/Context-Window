// One of the check-ins between rooms (see goFurther in room.jsx): when a
// device near the visitor gives away its owner's name ("Jason's iPhone"),
// the whole page becomes "is your name jason?". It's only in the draw when
// there's a name nobody has asked about yet; once per name per tab.
import { useEffect, useState, useSyncExternalStore } from "react";
import Typewriter from "./typewriter";
import { getStream, onCamera } from "./camera.js";
import { onDevices, owners } from "./owners.js";
import { loadVisit, saveVisit } from "./visit.js";

const REPLY_MS = 2800;

// Names already asked about, for this tab, across visits: the devices don't
// change when the visitor starts over, so neither does the question.
function asked() {
  try {
    return JSON.parse(sessionStorage.getItem("askedNames")) ?? [];
  } catch {
    return [];
  }
}

function markAsked(name) {
  sessionStorage.setItem("askedNames", JSON.stringify([...asked(), name]));
}

// Every owner the devices give away, kept current: read on mount, when the
// camera comes on (that's when labels appear) and when a device connects.
export function useOwners() {
  const [found, setFound] = useState([]);
  const stream = useSyncExternalStore(onCamera, getStream);
  useEffect(() => {
    let live = true;
    const check = () =>
      owners(loadVisit()?.nearby).then((list) => live && setFound(list));
    check();
    const stop = onDevices(check);
    return () => {
      live = false;
      stop();
    };
  }, [stream]);
  return found;
}

// The first owner not yet asked about, or null.
export const unasked = (found) =>
  found.find(({ name }) => !asked().includes(name)) ?? null;

// The check-in itself. `who` is { name, device, plural }; `onDone` goes on to
// the next room once the house has replied.
export default function NameCheckIn({ who, onDone }) {
  const [reply, setReply] = useState(null);
  const { name, device, plural } = who;

  function answer(yes) {
    markAsked(name);
    const visit = loadVisit();
    if (yes) visit.name = name;
    else visit.notName = name;
    saveVisit(visit);
    const these = plural ? `${device} are these` : `${device} is this`;
    setReply(yes ? "> we thought so." : `> then whose ${these}?`);
    setTimeout(onDone, REPLY_MS);
  }

  return (
    <div
      className="whoareyou"
      role="alertdialog"
      aria-label={`is your name ${name}?`}
    >
      <p className="giant">is your name {name}?</p>
      {reply ? (
        <Typewriter text={reply}></Typewriter>
      ) : (
        <p className="choices">
          <button
            className="obj"
            ref={(el) => el?.focus()}
            onClick={() => answer(true)}
          >
            [yes]
          </button>{" "}
          <button className="obj" onClick={() => answer(false)}>
            [no]
          </button>
        </p>
      )}
    </div>
  );
}
