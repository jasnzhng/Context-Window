// Everything that decays: the filenames, the floor plan, and the visitor's
// answer. A room is decayed once, when it arrives, and then saved, so going
// back shows the same room. `p` is the room's decay (0 -> 1) from the server.
import { PLANS } from "./plans.js";

const SWAP = { png: "jpg", jpg: "png" };
const MARKER = /\{(\d)\}/g;
const DUST = [...".:',~"];
const LOOKALIKE = {
  a: "@",
  b: "8",
  e: "3",
  g: "9",
  i: "1",
  l: "|",
  o: "0",
  s: "$",
  t: "+",
};
const LETTERS = [..."abcdefghijklmnopqrstuvwxyz"];
const SYMBOLS = [..."#%&*?!@$~^+=<>/\\|"];
const MIRROR = {
  "/": "\\",
  "\\": "/",
  "(": ")",
  ")": "(",
  "[": "]",
  "]": "[",
  "{": "}",
  "}": "{",
  "<": ">",
  ">": "<",
};

const pick = (list) => list[Math.floor(Math.random() * list.length)];
const shuffle = (list) => list.toSorted(() => Math.random() - 0.5);

// Shortens the stem so the whole name fits in 20 characters.
function fit(stem, suffix, ext) {
  const room = 20 - suffix.length - (ext ? ext.length + 1 : 0);
  return stem.slice(0, room) + suffix + (ext ? `.${ext}` : "");
}

function decayFilename(name, p) {
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

// Decays every name, numbering any that collide.
function decayNames(objects, p) {
  const seen = [];
  return objects.map(({ name }) => {
    const base = decayFilename(name, p);
    let shown = base;
    for (let n = 2; seen.includes(shown); n++) {
      const [stem, ext] = base.split(".");
      shown = fit(stem, `(${n})`, ext);
    }
    seen.push(shown);
    return shown;
  });
}

// Flips a plan left to right. Braces flip too, so "{0}" still reads "{0}".
function mirror(lines) {
  const width = Math.max(...lines.map((line) => line.length));
  return lines.map((line) =>
    [...line.padEnd(width)]
      .reverse()
      .map((ch) => MIRROR[ch] ?? ch)
      .join("")
      .trimEnd(),
  );
}

// Wears the plan away: strokes crumble into dust or vanish, and lines slip
// sideways. Markers are left whole so every object still has a place.
function erode(lines, p) {
  return lines.map((line) => {
    const kept = new Set(
      [...line.matchAll(MARKER)].flatMap(({ index }) => [
        index,
        index + 1,
        index + 2,
      ]),
    );
    const worn = [...line]
      .map((ch, i) => {
        if (kept.has(i)) return ch;
        if (ch === " ") return Math.random() < 0.02 * p ? pick(DUST) : ch;
        if (Math.random() >= 0.7 * p) return ch;
        return Math.random() < p ? " " : pick(DUST);
      })
      .join("");
    const slip =
      Math.random() < 0.4 * p ? 1 + Math.floor(Math.random() * 2) : 0;
    return " ".repeat(slip) + worn;
  });
}

// Writes each filename over the plan at a marker: reading right from it, or
// ending at it on a mirrored plan, where the free space is on the left.
// `order` deals objects to markers; a marker with no object is blanked.
// Returns the lines and where each object landed, for room.jsx to cut out.
function placeObjects(lines, names, order, flipped) {
  const slots = [];
  const art = lines.map((line, row) =>
    line.replace(MARKER, (marker, n, col) => {
      const index = order[n];
      if (index < names.length) {
        const start = flipped ? col + 3 - names[index].length : col;
        slots.push({ row, col: Math.max(0, start), index });
      }
      return "   ";
    }),
  );

  // Left to right on each line, pushing a label right if it would cover the
  // one before it.
  slots.sort((a, b) => a.row - b.row || a.col - b.col);
  slots.forEach((slot, i) => {
    const before = slots[i - 1];
    if (before?.row === slot.row) {
      slot.col = Math.max(
        slot.col,
        before.col + names[before.index].length + 1,
      );
    }
    const name = names[slot.index];
    const line = art[slot.row].padEnd(slot.col + name.length);
    art[slot.row] =
      line.slice(0, slot.col) + name + line.slice(slot.col + name.length);
  });
  return { art, slots };
}

// Damages a share `rate` of what's left of the answer: a letter turns into a
// lookalike or a stranger, a symbol takes its place, it falls out, or a
// symbol creeps in beside it. Each room damages the last room's copy, so
// nothing is ever repaired.
export function forget(text, rate) {
  return [...text]
    .map((ch) => {
      if (Math.random() >= rate) return ch;
      const roll = Math.random();
      if (roll < 0.3) return LOOKALIKE[ch.toLowerCase()] ?? pick(LETTERS);
      if (roll < 0.55) return pick(SYMBOLS);
      if (roll < 0.8) return "";
      return ch + pick(SYMBOLS);
    })
    .join("");
}

// Turns the server's room into the one the visitor sees: decayed names dealt
// across a worn (and maybe mirrored) floor plan, and the visitor's answer a
// little more damaged. `chosen` is set later, when the visitor goes further.
export function makeRoom(
  { narration, layout, objects, decay: p, context },
  prev,
  cameThrough,
  answer,
) {
  const names = decayNames(objects, p);
  const flipped = Math.random() < 0.5;
  const plan = flipped ? mirror(PLANS[layout].art) : PLANS[layout].art;
  // The share of what the last room remembered that this room loses.
  const rate = 1 - (1 - p) / (1 - (prev?.decay ?? 0));

  return {
    narration,
    objects: objects.map(({ note }, i) => ({ name: names[i], note })),
    ...placeObjects(erode(plan, p), names, shuffle([0, 1, 2, 3]), flipped),
    decay: p,
    context,
    remembered: forget(prev?.remembered ?? answer, rate),
    cameThrough,
    chosen: null,
  };
}
