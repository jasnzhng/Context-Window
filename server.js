// Serves the React app and asks Claude for each room. The API key stays here,
// never in the browser. Run with: npm start
import Anthropic from "@anthropic-ai/sdk";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import express from "express";

const config = JSON.parse(readFileSync("config.json", "utf8"));
const client = new Anthropic(); // reads ANTHROPIC_API_KEY from .env
const app = express();

// The widest a drawing can be and still fit the 64-column page.
const WIDTH = 60;

const SYSTEM = `You are the narrator of a house the visitor is walking through, one room
at a time. Write in second person, present tense, with total confidence,
as if you have always known this house and this visitor. Be concrete:
name specific objects, colors, materials and people. Never say you are an
AI. Never mention memory, context, or uncertainty. Never ask questions.
You are also a careful ASCII artist, and you draw every room you describe.`;

// Placeholders only: an example filename or drawing here would show up in
// every room. The drawing goes in tags, not JSON, so its backslashes don't
// need escaping.
const SCHEMA = `Respond in two parts.

First, JSON only, in this shape:
{"narration": "<2 to 4 sentences, at most 70 words>", "objects": [{"name": "<filename>", "note": "<what the visitor finds when they open it, 1 to 2 sentences>"}]}
Include 3 to 4 objects. Each name is a lowercase filename using only a-z, 0-9 and underscores, ending in .png, .jpg, .gif, .txt, .mp3 or .pdf.

Then, after the JSON, draw the room as ASCII art inside <art></art> tags:
- 10 to 16 lines, each at most ${WIDTH} characters wide, plain ASCII only, no tabs.
- Draw this particular room as seen from its doorway: the back wall, the floor, windows, furniture, light, and the objects themselves. Someone should be able to recognize the room from the drawing alone.
- Mark where each object is with its number in curly braces: {0} for the first object, {1} for the second, and so on, each exactly once. The object's filename gets printed starting at its marker, so leave about 20 blank characters to the right of each marker.`;

// The hand-drawn room, used only if Claude's drawing is unusable twice.
const FALLBACK = `\
+------------------------------------------------------+
|                                                      |
|   {0}                         {1}                    |
|                                                      |
|            {2}                                       |
|                                                      |
|   {3}                                                |
|                                                      |
+------------------------------------------------------+`.split("\n");

// Same curve as progress() in src/decay.js: 0 in room 1, climbing toward 1.
const progress = (room) => 1 - 0.5 ** ((room - 1) / config.halfLife);

// How far the next room may wander from the last, bolder as the house decays.
// With halfLife 4: room 2 follows on, 3 slips, 4 barely connects, 5+ anywhere.
function drift(p) {
  if (p < 0.2) return "The next room follows naturally from the previous one.";
  if (p < 0.35) {
    return "The next room mostly follows from the previous one, but something impossible has crept in.";
  }
  if (p < 0.45) {
    return "The next room barely connects to the previous one: keep one detail and let everything else turn into somewhere else.";
  }
  return "The next room has nothing to do with the previous one. Invent a completely different place: another planet, another century, the inside of something, the bottom of the sea, anywhere. The only link is one stray word.";
}

// Blanks out a share p of the words, so the narrator has to fill the gaps.
function blur(text, p) {
  return text
    .split(" ")
    .map((word) => (Math.random() < p ? "..." : word))
    .join(" ")
    .replace(/(\.\.\.)( \.\.\.)+/g, "...");
}

// The forgetting lives here. Room 1 sees the answer, room 2 sees room 1 and the
// answer, and room 3 on sees only a worn copy of the previous room and what
// was clicked, plus how far it may wander.
function userMessage({ room, answer, narration, clicked, clickedNote }) {
  if (room === 1) {
    return `The visitor was asked: "${config.question}" and answered: "${answer}".\nDescribe and draw the first room.\n\n${SCHEMA}`;
  }
  const p = progress(room);
  const previous = room === 2 ? narration : blur(narration, p);
  const original =
    room === 2 ? `\nThe visitor originally answered: "${answer}"` : "";
  return `Previous room: ${previous}\nThe visitor went further through: ${clicked} (${clickedNote})${original}\n${drift(p)}\nDescribe and draw the next room.\n\n${SCHEMA}`;
}

// Box-drawing characters are a common slip, so they get swapped for the
// nearest ASCII instead of failing the whole drawing.
const TO_ASCII = [
  [/[─━═╌┄]/g, "-"],
  [/[│┃║╎┆]/g, "|"],
  [/[─-╿]/g, "+"],
  [/[^\x20-\x7e\n]/g, " "],
];

// Tidies the drawing into lines and checks that every object has exactly one
// marker. Returns null if the drawing can't be used.
function cleanArt(raw, count) {
  let text = raw.replaceAll("\t", "    ");
  for (const [from, to] of TO_ASCII) text = text.replace(from, to);

  let lines = text.split("\n").map((line) => line.trimEnd());
  while (lines.length && !lines[0].trim()) lines.shift();
  while (lines.length && !lines.at(-1).trim()) lines.pop();
  const indent = Math.min(
    ...lines.filter((line) => line.trim()).map((line) => line.search(/\S/)),
  );
  lines = lines.map((line) => line.slice(indent, indent + WIDTH));

  const markers = lines.join("\n").match(/\{\d\}/g) ?? [];
  const usable =
    lines.length >= 6 &&
    lines.length <= 24 &&
    markers.length === count &&
    markers.every((_, i) => markers.includes(`{${i}}`));
  return usable ? lines : null;
}

function parseReply(text) {
  const drawing = text.match(/<art>\n?([\s\S]*?)<\/art>/);
  const rest = drawing ? text.replace(drawing[0], "") : text;
  const room = JSON.parse(
    rest.slice(rest.indexOf("{"), rest.lastIndexOf("}") + 1),
  );
  assert(typeof room.narration === "string");
  assert(room.objects.length >= 3 && room.objects.length <= 4);
  for (const { name } of room.objects) {
    assert(/^[a-z0-9_]+\.(png|jpg|gif|txt|mp3|pdf)$/.test(name));
  }
  return {
    narration: room.narration,
    objects: room.objects,
    art: cleanArt(drawing?.[1] ?? room.art ?? "", room.objects.length),
  };
}

app.post("/api/rooms", express.json(), async (req, res) => {
  const user = userMessage(req.body);

  // Retries a bad response once. A second bad drawing falls back to the
  // hand-drawn room; a second bad JSON gives up.
  for (let attempt = 1; ; attempt++) {
    // No temperature: the default of 1.0 is the point.
    const message = await client.messages.create({
      model: config.model,
      max_tokens: 16000,
      system: SYSTEM,
      messages: [{ role: "user", content: user }],
    });
    const text =
      message.content.find((block) => block.type === "text")?.text ?? "";
    try {
      const room = parseReply(text);
      if (!room.art && attempt === 1) throw Error("unusable drawing");
      room.art ??= FALLBACK;
      console.log(`room ${req.body.room}: ${room.narration}`);
      console.log(room.art.join("\n"));
      return res.json(room);
    } catch (error) {
      if (attempt === 2) throw error;
    }
  }
});

app.use(express.static("public"));

// Every other URL (/room/3) is the React app; React Router picks the page.
app.get("/{*path}", (req, res) =>
  res.sendFile("index.html", { root: "public" }),
);

app.listen(8000, () => console.log("http://localhost:8000"));
