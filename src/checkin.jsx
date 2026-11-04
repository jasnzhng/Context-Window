import { useEffect, useRef, useSyncExternalStore } from "react";
import Typewriter from "./typewriter";
import { getStream, onCamera, startCamera } from "./camera.js";
import { getPresence, onPresence } from "./presence.js";
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

// The webcam frame is 4:3 with object-fit: cover and mirrored, so a face box
// (as fractions of the camera's own frame) has to be cropped and flipped the
// same way to land on the face.
function place(box, aspect) {
  let { x, y, w, h } = box;
  if (aspect > 4 / 3) {
    const shown = 4 / 3 / aspect; // share of the width that's visible
    x = (x - (1 - shown) / 2) / shown;
    w /= shown;
  } else {
    const shown = aspect / (4 / 3);
    y = (y - (1 - shown) / 2) / shown;
    h /= shown;
  }
  return {
    left: `${(1 - x - w) * 100}%`,
    top: `${y * 100}%`,
    width: `${w * 100}%`,
    height: `${h * 100}%`,
  };
}

// A window with the visitor's own webcam feed, a bracket around every face
// in it, and a question. `choices` are the buttons; `reply`, once set, is the
// house's answer, typed under the question. Without a camera it shows
// "no signal", or, once the house has given up on them, that it forgot.
export default function CheckIn({ question, choices, reply }) {
  const video = useRef(null);
  const stream = useSyncExternalStore(onCamera, getStream);
  const { boxes, aspect } = useSyncExternalStore(onPresence, getPresence);
  const visit = loadVisit(); // re-read: the house may forget them mid-question

  useEffect(() => {
    if (visit.peek) startCamera();
  }, [visit.peek]);

  useEffect(() => {
    if (stream && video.current) video.current.srcObject = stream;
  }, [stream]);

  return (
    <div className="backdrop">
      <div
        className="checkin"
        role="dialog"
        aria-modal="true"
        aria-label={question}
      >
        <div className="titlebar">
          <span>user_webcam</span>
          {stream && boxes.length > 0 && (
            <span className="rec">
              ● {boxes.length === 1 ? "tracking" : `${boxes.length} faces`}
            </span>
          )}
        </div>
        {stream ? (
          <div className="feed">
            <video ref={video} autoPlay muted playsInline></video>
            {boxes.map((box, i) => (
              <span
                key={i}
                className="face"
                style={place(box, aspect)}
                data-label={i === 0 ? "you" : "?"}
              ></span>
            ))}
          </div>
        ) : (
          <div className="nosignal">
            {visit.forgotFace ? "we forgot what you look like" : "no signal"}
          </div>
        )}
        <Typewriter text={question}></Typewriter>
        {reply ? (
          <Typewriter text={reply}></Typewriter>
        ) : (
          <p>
            &gt;{" "}
            {choices.map(({ label, onPick }, i) => (
              <span key={label}>
                <button
                  className="obj"
                  ref={i === 0 ? (el) => el?.focus() : undefined}
                  onClick={onPick}
                >
                  [{label}]
                </button>{" "}
              </span>
            ))}
          </p>
        )}
      </div>
    </div>
  );
}
