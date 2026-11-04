// One of the check-ins between rooms (see goFurther in room.jsx), only when
// the house has been listening and has heard enough to quote: a snippet of
// what the visitor said, and "what did you mean by that?". Their answer is
// fed into the next room.
import { useState } from "react";
import Typewriter from "./typewriter";

export default function TranscriptCheckIn({ snippet, onDone }) {
  const [answer, setAnswer] = useState("");

  function handleSubmit(event) {
    event.preventDefault();
    onDone(answer.trim() || null);
  }

  return (
    <div className="backdrop">
      <div
        className="checkin"
        role="dialog"
        aria-modal="true"
        aria-label="what did you mean by that?"
      >
        <div className="titlebar">
          <span>transcript.txt</span>
          <span className="rec">● heard</span>
        </div>
        <blockquote className="snippet">
          &ldquo;...{snippet}...&rdquo;
        </blockquote>
        <Typewriter text="what did you mean by that?"></Typewriter>
        <form onSubmit={handleSubmit}>
          &gt;{" "}
          <input
            className="meant"
            value={answer}
            onChange={(event) => setAnswer(event.target.value)}
            ref={(el) => el?.focus()}
            maxLength={300}
            autoComplete="off"
            aria-label="what you meant"
          />
          <p>
            <button className="obj">[enter]</button>{" "}
            <button type="button" className="obj" onClick={() => onDone(null)}>
              [say nothing]
            </button>
          </p>
        </form>
      </div>
    </div>
  );
}
