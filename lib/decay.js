// Filename decay, shared by generate.js and build.js so the name the visitor
// sees is exactly the name the next room is told was clicked.

// Seeded random numbers: the same parts always give the same sequence.
export function rng(...parts) {
  let a = 2166136261;
  for (const ch of parts.join(":"))
    a = Math.imul(a ^ ch.charCodeAt(0), 16777619);
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 0 in the first room, 1 in the last.
export function progress(room, total) {
  return (room - 1) / (total - 1);
}

const SWAP = { png: "jpg", jpg: "png" };

// Shortens the stem so the whole name fits a 20-character slot.
function fit(stem, suffix, ext) {
  const room = 20 - suffix.length - (ext ? ext.length + 1 : 0);
  return stem.slice(0, room) + suffix + (ext ? `.${ext}` : "");
}

export function decayFilename(name, room, total, random) {
  const p = progress(room, total);
  const [stem, ext] = name.split(".");
  const caps = () =>
    [...stem].map((c) => (random() < 0.35 ? c.toUpperCase() : c)).join("");

  if (p < 0.15) return fit(stem, "", ext);
  if (p < 0.35) return fit(stem, `(${2 + Math.floor(random() * 3)})`, ext);
  if (p < 0.55) return fit(stem, "_final", SWAP[ext] ?? ext);
  if (p < 0.75) return fit(caps(), "_FINAL_v2", SWAP[ext] ?? ext);
  if (p < 0.9) return `${stem.replaceAll("_", "").slice(0, 6)}~1.bin`;
  return "untitled";
}

// The displayed names for one room, numbered when two decay to the same thing.
export function decayRoom(names, room, total, seed) {
  const seen = [];
  return names.map((name, i) => {
    const base = decayFilename(name, room, total, rng(seed, room, i, "name"));
    let shown = base;
    for (let n = 2; seen.includes(shown); n++) {
      const [stem, ext] = base.split(".");
      shown = fit(stem, `(${n})`, ext);
    }
    seen.push(shown);
    return shown;
  });
}
