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

// A room only exists once the visitor has walked through the ones before it.
// The key gives each room a fresh component, so its typewriter restarts.
function RoomRoute() {
  const n = Number(useParams().n);
  const visit = loadVisit();
  if (!visit || n > visit.rooms.length + 1) return <Navigate to="/"></Navigate>;
  return <Room key={n} n={n}></Room>;
}
