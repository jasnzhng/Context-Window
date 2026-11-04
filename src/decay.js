// templates for rooms, objects, etc that get decayed
import config from "../config.json";

const SWAP = { png: "jpg", jpg: "png" };
const MARKER = /\{(\d)\}/g;
const DUST = [".", ":", "'", "`", ",", "~"];
const WIDTH = 60; // matches the drawing width in server.js

const pick = (list) => list[Math.floor(Math.random() * list.length)];

// 0 in the first room, then climbing toward 1 forever: half the house is gone
// after `halfLife` rooms, three quarters after twice that, and so on.
export function progress(room) {
  return 1 - 0.5 ** ((room - 1) / config.halfLife);
}

// Shortens the stem so the whole name fits a 20-character slot.
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

// Wears the drawing away: strokes crumble into dust or vanish, and lines slip
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
    let worn = [...line]
      .map((ch, i) => {
        if (kept.has(i)) return ch;
        if (ch === " ") return Math.random() < 0.02 * p ? pick(DUST) : ch;
        if (Math.random() >= 0.7 * p) return ch;
        return Math.random() < p ? " " : pick(DUST);
      })
      .join("");
    if (Math.random() < 0.4 * p) {
      worn = " ".repeat(1 + Math.floor(Math.random() * 2)) + worn;
    }
    return worn;
  });
}

// Writes each filename over the drawing, starting at its marker. Returns the
// finished lines and where each object landed, so room.jsx can make it a link.
function placeObjects(lines, names) {
  const slots = [];
  const blank = lines.map((line, row) =>
    line.replace(MARKER, (marker, index, col) => {
      slots.push({ row, col, index: Number(index) });
      return "   ";
    }),
  );
  slots.sort((a, b) => a.row - b.row || a.col - b.col);

  // Keep labels inside the page, and push a label right if it would cover
  // the one before it on the same line.
  let end = 0;
  slots.forEach((slot, i) => {
    const name = names[slot.index];
    if (i === 0 || slots[i - 1].row !== slot.row) end = 0;
    slot.col = Math.max(Math.min(slot.col, WIDTH - name.length), end);
    end = slot.col + name.length + 1;
    const line = blank[slot.row].padEnd(slot.col + name.length);
    blank[slot.row] =
      line.slice(0, slot.col) + name + line.slice(slot.col + name.length);
  });

  const width = Math.max(...blank.map((line) => line.length));
  return { art: blank.map((line) => line.padEnd(width)), slots };
}

// Each room loses a share of whatever the last room still remembered, so a
// letter that's gone never comes back.
function forget(text, room) {
  if (room === 1) return text;
  const lose = 1 - (1 - progress(room)) / (1 - progress(room - 1));
  return [...text]
    .map((ch) => (ch !== " " && Math.random() < lose ? "_" : ch))
    .join("");
}

// Turns Claude's response into the room the visitor sees: decayed names
// (numbered if two collide), one random exit, the drawing worn down, and the
// visitor's answer with a few more letters missing.
export function makeRoom({ narration, objects, art }, room, prev, answer) {
  const p = progress(room);
  const seen = [];
  const names = objects.map(({ name }) => {
    const base = decayFilename(name, p);
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
    ...placeObjects(erode(art, p), names),
    decay: p,
    remembered: forget(prev?.remembered ?? answer, room),
    cameThrough: prev?.objects[prev.exit].name,
  };
}
