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
import { startCamera } from "./camera";

// A reload drops the webcam stream; turn it back on if the visitor said yes.
if (loadVisit()?.peek) startCamera();

const mountroot = createRoot(document.getElementById("mountme"));
mountroot.render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Opening></Opening>}></Route>
        <Route path="/room/:n" element={<RoomRoute></RoomRoute>}></Route>
      </Routes>
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
