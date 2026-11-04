// When the visitor stops looking at the screen (gone from the camera, head
// turned away, or eyes shut for a moment), the whole page turns into one
// question. It goes the moment they look back. Only while the camera is on.
import { useSyncExternalStore } from "react";
import { getPresence, onPresence } from "./presence.js";

export default function Uninterested() {
  const { looking } = useSyncExternalStore(onPresence, getPresence);
  if (looking !== false) return null;
  return (
    <div className="uninterested" role="alert">
      <p>are you not interested?</p>
    </div>
  );
}
