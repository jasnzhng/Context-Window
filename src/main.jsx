import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useParams,
} from "react-router-dom";
import Opening from "./opening";
import Room from "./room";
import { loadVisit } from "./visit";
import { startCamera } from "./camera.js";
import { startPresence } from "./presence.js";
import { startAway } from "./away.js";
import { forget } from "./decay.js";
import { startGlitch } from "./glitch.js";
import Exposed from "./exposed";
import Uninterested from "./uninterested";
import Listening from "./listening";
import { startListening } from "./listen.js";

// A reload drops the webcam stream and the recognizer; turn them back on if
// the visitor said yes. What was heard before the reload is gone for good.
if (loadVisit()?.peek) startCamera();
if (loadVisit()?.listen) startListening();
startPresence();
startAway();
startGlitch();

// Anything copied off the page comes out a little more forgotten than it
// looked, as worn as the last room the visitor saw.
document.addEventListener("copy", (event) => {
  const text = getSelection().toString();
  if (!text) return;
  const decay = loadVisit()?.rooms.at(-1)?.decay ?? 0;
  event.clipboardData.setData(
    "text/plain",
    forget(text, Math.max(0.08, decay)),
  );
  event.preventDefault();
});

const mountroot = createRoot(document.getElementById("mountme"));
mountroot.render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Opening></Opening>}></Route>
        <Route path="/room/:n" element={<RoomRoute></RoomRoute>}></Route>
      </Routes>
      <Exposed></Exposed>
      <Listening></Listening>
      <Uninterested></Uninterested>
    </BrowserRouter>
  </StrictMode>,
);

// A room only exists once the visitor has walked through the ones before it
// and chosen an object in the room just before. The key gives each room a
// fresh component, so its typewriter restarts.
function RoomRoute() {
  const n = Number(useParams().n);
  const visit = loadVisit();
  const prev = visit?.rooms[n - 2];
  if (!visit || n > visit.rooms.length + 1 || (n > 1 && prev?.chosen == null)) {
    return <Navigate to="/"></Navigate>;
  }
  return <Room key={n} n={n}></Room>;
}
