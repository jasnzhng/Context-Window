import { useState } from "react";
import { useNavigate } from "react-router-dom";
import Typewriter from "./typewriter";
import { startCamera, stopCamera } from "./camera";
import { saveVisit } from "./visit";
import config from "../config.json";

// Three questions, one after another, like a terminal session: the answer,
// how much it matters, and whether we can turn the camera on.
export default function Opening() {
  const navigate = useNavigate();
  const [answer, setAnswer] = useState(null);
  const [importance, setImportance] = useState(null);

  // A new answer starts a new walk through the house. "yes" turns the
  // webcam on (the browser asks first) and leaves it on for the whole visit.
  async function begin(peek) {
    if (peek) await startCamera();
    else stopCamera();
    saveVisit({ answer, importance, peek, rooms: [] });
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
          <p>
            &gt;{" "}
            <button className="obj" onClick={() => begin(true)}>
              [yes]
            </button>{" "}
            <button className="obj" onClick={() => begin(false)}>
              [no]
            </button>
          </p>
        </>
      )}
    </main>
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
