// Everything that decays: filenames and walls. A room is decayed once, when it
// arrives, and then saved, so going back shows the same room.

const SWAP = { png: "jpg", jpg: "png" };

// The hand-made room. Each [N] is the left edge of a 20-character slot for object N.
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

// 0 in the first room, 1 in the last.
function progress(room, total) {
  return (room - 1) / (total - 1);
}

// Shortens the stem so the whole name fits a 20-character slot.
function fit(stem, suffix, ext) {
  const room = 20 - suffix.length - (ext ? ext.length + 1 : 0);
  return stem.slice(0, room) + suffix + (ext ? `.${ext}` : "");
}

function decayFilename(name, room, total) {
  const p = progress(room, total);
  const [stem, ext] = name.split(".");
  const caps = () =>
    [...stem].map((c) => (Math.random() < 0.35 ? c.toUpperCase() : c)).join("");

  if (p < 0.15) return fit(stem, "", ext);
  if (p < 0.35) return fit(stem, `(${2 + Math.floor(Math.random() * 3)})`, ext);
  if (p < 0.55) return fit(stem, "_final", SWAP[ext] ?? ext);
  if (p < 0.75) return fit(caps(), "_FINAL_v2", SWAP[ext] ?? ext);
  if (p < 0.9) return `${stem.replaceAll("_", "").slice(0, 6)}~1.bin`;
  return "untitled";
}

// Cracks up to 8% of the wall characters into spaces or periods, more each room.
function crack(room, total) {
  const rate = 0.08 * progress(room, total);
  return FRAME.replace(/[+\-|]/g, (ch) =>
    Math.random() < rate ? (Math.random() < 0.5 ? " " : ".") : ch,
  );
}

// Turns Claude's response into the room the visitor sees: decayed names
// (numbered if two collide), one random exit, and cracked walls.
export function makeRoom({ narration, objects }, room, total, cameThrough) {
  const seen = [];
  const names = objects.map(({ name }) => {
    const base = decayFilename(name, room, total);
    let shown = base;
    for (let n = 2; seen.includes(shown); n++) {
      const [stem, ext] = base.split(".");
      shown = fit(stem, `(${n})`, ext);
    }
    seen.push(shown);
    return shown;
  });

  return {
    narration,
    objects: objects.map((object, i) => ({
      name: names[i],
      note: object.note,
    })),
    exit: Math.floor(Math.random() * objects.length),
    frame: crack(room, total),
    cameThrough,
  };
}
