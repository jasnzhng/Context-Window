// When a device near the visitor gives away its owner's name ("Jason's
// iPhone"), the whole page stops to ask: "is your name jason?". Once per
// name per tab, checked on every room, whenever the camera comes on (that's
// when the labels appear) and whenever a device connects mid-visit.
import { useEffect, useState, useSyncExternalStore } from "react";
import { useLocation } from "react-router-dom";
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

export default function WhoAreYou() {
  const [asking, setAsking] = useState(null); // { name, device, plural, reply }
  const stream = useSyncExternalStore(onCamera, getStream);
  const { pathname } = useLocation();
  const inHouse = pathname.startsWith("/room/");

  useEffect(() => {
    if (asking || !inHouse) return;
    let live = true;
    const check = () =>
      owners(loadVisit()?.nearby).then((found) => {
        const next = found.find(({ name }) => !asked().includes(name));
        if (live && next) setAsking(next);
      });
    check();
    const stop = onDevices(check);
    return () => {
      live = false;
      stop();
    };
  }, [asking, inHouse, pathname, stream]);

  if (!asking) return null;
  const { name, device, plural, reply } = asking;

  function answer(yes) {
    markAsked(name);
    const visit = loadVisit();
    if (visit) {
      if (yes) visit.name = name;
      else visit.notName = name;
      saveVisit(visit);
    }
    const these = plural ? `${device} are these` : `${device} is this`;
    setAsking({
      ...asking,
      reply: yes ? "> we thought so." : `> then whose ${these}?`,
    });
    setTimeout(() => setAsking(null), REPLY_MS);
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
