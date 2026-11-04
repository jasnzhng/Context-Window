import { useState } from "react";
import { useNavigate } from "react-router-dom";
import Typewriter from "./typewriter";
import { startCamera, stopCamera } from "./camera";
import { saveVisit } from "./visit";
import { locate } from "./location.js";
import { lookAround } from "./owners.js";
import config from "../config.json";

// Five questions, one after another, like a terminal session: the answer,
// how much it matters, whether we can turn the camera on, where they are, and
// whether we can look around for their things. Every permission the visit
// uses is asked for here, at the start.
export default function Opening() {
  const navigate = useNavigate();
  const [answer, setAnswer] = useState(null);
  const [importance, setImportance] = useState(null);
  const [peek, setPeek] = useState(null);
  const [locating, setLocating] = useState(false);
  const [shared, setShared] = useState(null); // their answer to location
  const [where, setWhere] = useState(null);
  const [looking, setLooking] = useState(false);

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

  // A new answer starts a new walk through the house. "yes" opens the
  // Bluetooth picker and asks for the microphone (see owners.js), so the
  // house can learn whose things are nearby, then goes in.
  async function begin(look) {
    setLooking(look);
    const nearby = look ? await lookAround() : null;
    saveVisit({ answer, importance, peek, where, nearby, rooms: [] });
    navigate("/room/1");
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
          ) : (
            <YesNo onAnswer={begin}></YesNo>
          )}
        </>
      )}
    </main>
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
