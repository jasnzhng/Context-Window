import { useState } from "react";
import { useNavigate } from "react-router-dom";
import Typewriter from "./typewriter";
import { startCamera, stopCamera } from "./camera";
import { saveVisit } from "./visit";
import { locate } from "./location.js";
import { lookAround } from "./owners.js";
import { canListen, prepareListening, startListening } from "./listen.js";
import config from "../config.json";

// First a privacy notice, then up to six questions, one after another, like
// a terminal session: the answer, how much it matters, whether we can turn
// the camera on, where they are, whether we can look around for their
// things, and whether we can listen. Every permission the visit uses is
// asked for here, at the start, and each one can be refused.
export default function Opening() {
  const navigate = useNavigate();
  const [agreed, setAgreed] = useState(false);
  const [answer, setAnswer] = useState(null);
  const [importance, setImportance] = useState(null);
  const [peek, setPeek] = useState(null);
  const [locating, setLocating] = useState(false);
  const [shared, setShared] = useState(null); // their answer to location
  const [where, setWhere] = useState(null);
  const [looking, setLooking] = useState(false);
  const [nearby, setNearby] = useState(undefined); // undefined until asked
  const [preparing, setPreparing] = useState(false);

  // "yes" turns the webcam on (the browser asks first) and leaves it on for
  // the whole visit.
  async function choosePeek(yes) {
    if (yes) await startCamera();
    else stopCamera();
    setPeek(yes);
  }

  // "yes" asks the browser for an exact fix and looks up the street address.
  async function chooseWhere(share) {
    setLocating(share);
    setWhere(share ? await locate() : null);
    setLocating(false);
    setShared(share);
  }

  // "yes" opens the Bluetooth picker and asks for the microphone (see
  // owners.js), so the house can learn whose things are nearby. Then the
  // last question, if this browser can transcribe on the device; otherwise
  // straight in.
  async function chooseLook(look) {
    setLooking(look);
    const found = look ? await lookAround() : null;
    setLooking(false);
    if (canListen()) setNearby(found);
    else begin(found, false);
  }

  // "yes" gets the on-device language pack ready, then starts listening.
  async function chooseListen(yes) {
    setPreparing(yes);
    const listen =
      yes && (await prepareListening()) && (await startListening());
    begin(nearby, Boolean(listen));
  }

  // A new answer starts a new walk through the house.
  function begin(found, listen) {
    saveVisit({
      answer,
      importance,
      peek,
      where,
      nearby: found,
      listen,
      rooms: [],
    });
    navigate("/room/1");
  }

  if (!agreed) {
    return (
      <main>
        <title>context window</title>
        <h1>~ $ cat privacy.txt</h1>
        <Notice onAgree={() => setAgreed(true)}></Notice>
      </main>
    );
  }

  return (
    <main>
      <title>context window</title>
      <h1>~ $ ./context-window</h1>

      <Typewriter text={config.question}></Typewriter>
      {answer === null ? (
        <Prompt label="your answer" onAnswer={setAnswer}></Prompt>
      ) : (
        <p className="echo">&gt; {answer}</p>
      )}

      {answer !== null && (
        <>
          <Typewriter text="How important is that to you (1-10)?"></Typewriter>
          {importance === null ? (
            <Prompt
              label="how important, 1 to 10"
              type="number"
              onAnswer={(value) => setImportance(Number(value))}
            ></Prompt>
          ) : (
            <p className="echo">&gt; {importance}</p>
          )}
        </>
      )}

      {importance !== null && (
        <>
          <Typewriter text="Can we get a peek? We'll find it faster."></Typewriter>
          {peek === null ? (
            <YesNo onAnswer={choosePeek}></YesNo>
          ) : (
            <p className="echo">&gt; {peek ? "yes" : "no"}</p>
          )}
        </>
      )}

      {peek !== null && (
        <>
          <Typewriter text="Where are you right now? We'll start looking there."></Typewriter>
          {locating ? (
            <p className="status loading" aria-live="polite">
              locating
            </p>
          ) : shared === null ? (
            <YesNo onAnswer={chooseWhere}></YesNo>
          ) : (
            <p className="echo">&gt; {shared ? "yes" : "no"}</p>
          )}
        </>
      )}

      {shared !== null && (
        <>
          <Typewriter text="Is anything of yours nearby? Let us look around."></Typewriter>
          {looking ? (
            <p className="status loading" aria-live="polite">
              looking around
            </p>
          ) : nearby === undefined ? (
            <YesNo onAnswer={chooseLook}></YesNo>
          ) : (
            <p className="echo">&gt; done</p>
          )}
        </>
      )}

      {nearby !== undefined && (
        <>
          <Typewriter text="Can we listen while you walk? We'll write down what you say, on this device."></Typewriter>
          {preparing ? (
            <p className="status loading" aria-live="polite">
              getting ready to listen
            </p>
          ) : (
            <YesNo onAnswer={chooseListen}></YesNo>
          )}
        </>
      )}
    </main>
  );
}

// What the house does with what it's given, before it asks for any of it.
// Keep this true: if the site starts using something new, say so here.
function Notice({ onAgree }) {
  return (
    <section className="notice" aria-label="privacy notice">
      <p>
        This is an artwork. The house builds itself around you, and the more you
        let it see and hear, the more it can use. It only uses what you say yes
        to. Every question that follows can be answered no, and you can still
        walk through.
      </p>
      <ul>
        <li>
          <b>Camera.</b> Your face and blinks are tracked on this device and
          never uploaded, except one photo, taken as the first room loads, that
          is sent to Claude (Anthropic&apos;s AI) to build that room.
        </li>
        <li>
          <b>Location.</b> Your coordinates are sent to OpenStreetMap to look up
          the address, and the address to Claude to shape the rooms.
        </li>
        <li>
          <b>Nearby devices.</b> Device names (like &ldquo;Jason&apos;s
          iPhone&rdquo;) are read in your browser and never uploaded.
        </li>
        <li>
          <b>Microphone.</b> If you let the house listen, what you say is
          transcribed in the background, on this device, for as long as you
          walk. A few short phrases, and anything you type when it asks what you
          meant, are sent to Claude to write the next rooms. The loudness meter
          never leaves this device. A <span className="rec">● listening</span>{" "}
          line stays on screen, and its [stop] button turns the microphone off
          and erases the transcript.
        </li>
        <li>
          <b>Clipboard.</b> Only if you choose to show it, and then it&apos;s
          sent to Claude as an object in a room.
        </li>
      </ul>
      <p>
        All of it is used only for this artwork. This site doesn&apos;t save any
        of it: no accounts, no recordings, no transcripts, no logs of what you
        said. Closing the tab forgets everything. If anyone else is in the room
        with you, let them know the house can hear them too.
      </p>
      <p>
        &gt;{" "}
        <button className="obj" ref={(el) => el?.focus()} onClick={onAgree}>
          [i understand]
        </button>
      </p>
    </section>
  );
}

function YesNo({ onAnswer }) {
  return (
    <p>
      &gt;{" "}
      <button
        className="obj"
        ref={(el) => el?.focus()}
        onClick={() => onAnswer(true)}
      >
        [yes]
      </button>{" "}
      <button className="obj" onClick={() => onAnswer(false)}>
        [no]
      </button>
    </p>
  );
}

// One input line. It takes focus as soon as it appears, so the visitor can
// keep typing from one question to the next.
function Prompt({ label, type = "text", onAnswer }) {
  function handleSubmit(event) {
    event.preventDefault();
    onAnswer(event.target.answer.value);
  }

  return (
    <form onSubmit={handleSubmit}>
      &gt;{" "}
      <input
        name="answer"
        type={type}
        min={type === "number" ? 1 : undefined}
        max={type === "number" ? 10 : undefined}
        ref={(el) => el?.focus()}
        autoComplete="off"
        aria-label={label}
        required
      />{" "}
      <button className="obj">[enter]</button>
    </form>
  );
}
