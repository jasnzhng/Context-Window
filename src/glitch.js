// Every time the visitor blinks, the page loses its grip on a few letters:
// random characters swap for other random ones, then come back. The swap
// outlasts the blink itself (HOLD_MS), so it's still there when the eyes open.
//
// The page is React's, and the typewriter rewrites its text every 20 ms, so
// a character is only put back if its text node still holds the swapped text.
// If React changed it in the meantime, React's version wins.
import { onBlink } from "./presence.js";

const SHARE = 0.04; // of the visible characters, per blink
const MIN = 6;
const HOLD_MS = 420;
const GLYPHS = [
  ..."abcdefghijklmnopqrstuvwxyz0123456789#%&*?!@$~^+=<>/\\|.:',",
];

const pick = (list) => list[Math.floor(Math.random() * list.length)];

// Text nodes on the page with something worth swapping, skipping anything
// hidden or that isn't text the visitor reads (inputs, the overlay).
function textNodes(root) {
  const nodes = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement;
      if (!node.nodeValue.trim() || !parent) return NodeFilter.FILTER_REJECT;
      if (parent.closest("input, textarea, .uninterested, [aria-hidden]")) {
        return NodeFilter.FILTER_REJECT;
      }
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  while (walker.nextNode()) nodes.push(walker.currentNode);
  return nodes;
}

// Nodes currently showing swapped text: node -> { original, shown, timer }.
// Blinks can land closer together than HOLD_MS, so a second blink may pick a
// node that is still scrambled. Its "original" must be the first blink's
// original, not the scrambled text, or the node is never put back.
const held = new Map();

// What the node would read if no blink were holding it. If the text no longer
// matches what we swapped in, React rewrote it and its version is the truth.
function baseText(node) {
  const h = held.get(node);
  return h && node.nodeValue === h.shown ? h.original : node.nodeValue;
}

function release(node) {
  const h = held.get(node);
  if (!h) return;
  held.delete(node);
  if (node.isConnected && node.nodeValue === h.shown) {
    node.nodeValue = h.original;
  }
}

function scramble(root) {
  // Every swappable character, as [node, index].
  const spots = [];
  for (const node of textNodes(root)) {
    const text = baseText(node);
    [...text].forEach((ch, i) => {
      if (ch.trim()) spots.push([node, i]);
    });
  }
  if (!spots.length) return;

  // Group the chosen characters by node, then rewrite each node once.
  const count = Math.max(MIN, Math.round(spots.length * SHARE));
  const chosen = new Map();
  for (let k = 0; k < count; k++) {
    const [node, i] = pick(spots);
    if (!chosen.has(node)) chosen.set(node, new Set());
    chosen.get(node).add(i);
  }

  for (const [node, indices] of chosen) {
    const original = baseText(node);
    clearTimeout(held.get(node)?.timer);
    const chars = [...original];
    for (const i of indices) {
      let glyph = pick(GLYPHS);
      if (glyph === chars[i]) glyph = pick(GLYPHS);
      chars[i] = glyph;
    }
    node.nodeValue = chars.join("");
    held.set(node, {
      original,
      shown: node.nodeValue,
      timer: setTimeout(() => release(node), HOLD_MS),
    });
  }
}

// Called once, from main.jsx. Nothing happens without a camera, and nothing
// moves for visitors who've asked for less motion; the panel still counts.
export function startGlitch(root = document.getElementById("mountme")) {
  const calm = matchMedia("(prefers-reduced-motion: reduce)");
  onBlink(() => {
    if (!calm.matches && !document.hidden) scramble(root);
  });
}
