// Turns chain.json into one HTML page per room in dist/. Webpack adds bundle.js.
//   node build.js                            (reads chain.json)
//   node build.js fixtures/chain.fake.json

import {
  copyFileSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { decayRoom, progress, rng } from "./lib/decay.js";

// Each [N] is the left edge of a 20-character slot that React fills with object N.
const FRAME = `\
+------------------------------------------------------+
|                                                      |
|   [0]                         [1]                    |
|                                                      |
|            [2]                                       |
|                                                      |
|   [3]                                                |
|                                                      |
+------------------------------------------------------+`;

const { meta, rooms } = JSON.parse(
  readFileSync(process.argv[2] ?? "chain.json", "utf8"),
);
const total = rooms.length;
const file = (n) => `room-${String(n).padStart(2, "0")}.html`;
const names = rooms.map((r) =>
  decayRoom(
    r.response.objects.map((o) => o.name),
    r.room,
    total,
    meta.seed,
  ),
);

// Cracks up to 8% of the wall characters into spaces or periods, more each room.
function crack(room) {
  const random = rng(meta.seed, room, "walls");
  const rate = 0.08 * progress(room, total);
  return FRAME.replace(/[+\-|]/g, (ch) =>
    random() < rate ? (random() < 0.5 ? " " : ".") : ch,
  );
}

// Every page is the same shell; React renders it from the inlined data.
// "<" is escaped so model text can never close the <script> tag early.
function writePage(name, title, data) {
  const json = JSON.stringify(data).replace(/</g, "\\u003c");
  writeFileSync(
    `dist/${name}`,
    `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${title}</title>
<link rel="stylesheet" href="style.css">
</head>
<body>
<div id="mountme"></div>
<script id="page-data" type="application/json">${json}</script>
<script src="bundle.js"></script>
</body>
</html>
`,
  );
}

rmSync("dist", { recursive: true, force: true });
mkdirSync("dist");
copyFileSync("static/style.css", "dist/style.css");

writePage("index.html", "context window", {
  kind: "opening",
  question: meta.question,
});

rooms.forEach((r, i) => {
  const next = r.room < total ? file(r.room + 1) : "end.html";
  writePage(file(r.room), `room ${r.room} — context window`, {
    kind: "room",
    room: r.room,
    total,
    narration: r.response.narration,
    frame: crack(r.room),
    objects: r.response.objects.map((o, j) => ({
      name: names[i][j],
      note: o.note,
      href: j === r.exit_index ? next : null,
    })),
    cameThrough: i > 0 ? names[i - 1][rooms[i - 1].exit_index] : null,
  });
  console.log(file(r.room), names[i].join("  "));
});

writePage("end.html", "hello — context window", { kind: "end" });
console.log(`built ${total + 2} pages`);
