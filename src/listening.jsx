// Always on screen while the house is listening, with a way to make it stop.
// Stopping turns the microphone off and forgets everything it heard; the
// visitor can keep walking without it.
import { useSyncExternalStore } from "react";
import { getListening, onListening, stopListening } from "./listen.js";
import { loadVisit, saveVisit } from "./visit.js";

export default function Listening() {
  const { on } = useSyncExternalStore(onListening, getListening);
  if (!on) return null;

  function stop() {
    stopListening();
    const visit = loadVisit();
    if (visit) {
      visit.listen = false;
      saveVisit(visit);
    }
  }

  return (
    <div className="listening" role="status">
      <span className="rec">●</span> listening, on this device{" "}
      <button className="obj" onClick={stop}>
        [stop]
      </button>
    </div>
  );
}
