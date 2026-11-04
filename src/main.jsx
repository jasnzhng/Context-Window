import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import Opening from "./opening";
import Room from "./room";
import Ending from "./ending";

// build.js bakes each page's data into its HTML, since file:// pages can't fetch().
const page = JSON.parse(document.getElementById("page-data").textContent);
const Page = { opening: Opening, room: Room, end: Ending }[page.kind];

const mountroot = createRoot(document.getElementById("mountme"));
mountroot.render(
  <StrictMode>
    <Page page={page}></Page>
  </StrictMode>,
);
