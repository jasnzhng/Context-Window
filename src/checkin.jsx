import { useEffect, useRef, useState } from "react";
import Typewriter from "./typewriter";
import { startCamera } from "./camera";
import { loadVisit } from "./visit";

// Asked between rooms, every few rooms. Either answer goes on.
export const QUESTIONS = [
  "are you still looking?",
  "have you found it yet?",
  "is this where you left it?",
  "do you still remember what it looks like?",
  "is that you?",
  "are you sure it was in this house?",
  "should we keep going?",
  "does this room look familiar?",
  "are you alone right now?",
];

// Draws questions like cards from a shuffled deck, so none repeats until all
// have been asked. The deck lives in the visit; the caller saves it.
export function nextQuestion(visit) {
  if (!visit.questions?.length) {
    visit.questions = QUESTIONS.toSorted(() => Math.random() - 0.5);
  }
  return visit.questions.pop();
}

// A window with the visitor's own webcam feed and a yes/no question. Without
// a camera (they said no, or the browser refused) it shows "no signal".
export default function CheckIn({ question, onAnswer }) {
  const video = useRef(null);
  const [signal, setSignal] = useState(() => loadVisit().peek);

  useEffect(() => {
    if (!signal) return;
    let ignore = false;
    startCamera().then((stream) => {
      if (ignore) return;
      if (stream) video.current.srcObject = stream;
      else setSignal(false);
    });
    return () => {
      ignore = true;
    };
  }, [signal]);

  return (
    <div className="backdrop">
      <div
        className="checkin"
        role="dialog"
        aria-modal="true"
        aria-label={question}
      >
        <div className="titlebar">
          <span>cam0</span>
          <span className="rec">● REC</span>
        </div>
        {signal ? (
          <video ref={video} autoPlay muted playsInline></video>
        ) : (
          <div className="nosignal">no signal</div>
        )}
        <Typewriter text={question}></Typewriter>
        <p>
          &gt;{" "}
          <button className="obj" ref={(el) => el?.focus()} onClick={onAnswer}>
            [yes]
          </button>{" "}
          <button className="obj" onClick={onAnswer}>
            [no]
          </button>
        </p>
      </div>
    </div>
  );
}
