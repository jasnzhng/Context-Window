// Serves the React app and asks Claude for each room. The API key stays here,
// never in the browser. Run with: npm start
import Anthropic from "@anthropic-ai/sdk";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import express from "express";
import { rateLimit } from "express-rate-limit";
import { PLANS } from "./src/plans.js";

const config = JSON.parse(readFileSync("config.json", "utf8"));
const client = new Anthropic(); // reads ANTHROPIC_API_KEY from .env
const app = express();

// Hosts like Render sit behind one proxy hop. Trusting it lets req.ip be the
// visitor's address, not the proxy's, so the limit below is per visitor.
app.set("trust proxy", 1);

// Every room costs a Claude call, so cap how fast one visitor can spend them.
// 40 rooms in 10 minutes is far more than anyone reads; a script hits it fast.
const roomLimit = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 40,
  standardHeaders: "draft-8",
  legacyHeaders: false,
});

const SYSTEM = `You are the narrator of a house the visitor is walking through, one room
at a time. Write in second person, present tense, with total confidence,
as if you have always known this house and this visitor. Be concrete:
name specific objects, colors, materials and people. Never say you are an
AI. Never mention memory, context, or uncertainty. Never ask questions.
Return only JSON that matches the schema you are given.`;

// Placeholders only: an example filename here would show up in every room.
// The layouts come from src/plans.js, so a new plan shows up here on its own.
const SCHEMA = `Respond with JSON only, in this shape:
{"narration": "<2 to 4 sentences, at most 70 words>", "layout": "<one layout name from the list below>", "objects": [{"name": "<filename>", "note": "<what the visitor finds when they open it, 1 to 2 sentences>"}]}
Include 3 to 4 objects. Each name is a lowercase filename using only a-z, 0-9 and underscores, ending in .png, .jpg, .gif, .txt, .mp3 or .pdf.
For layout, pick the one closest to where this room is:
${Object.entries(PLANS)
  .map(([name, { hint }]) => `- ${name}: ${hint}`)
  .join("\n")}`;

// 0 in the first room, then climbing toward 1 forever: half the house is gone
// after halfLife rooms, three quarters after twice that, and so on. The
// browser gets it with each room and decays the room to match.
const progress = (room) => 1 - 0.5 ** ((room - 1) / config.halfLife);

// How much of room 1 can still reach this room's prompt. Rooms 1 and 2 see it
// whole; from room 3 on, blur() keeps only 1 - p of the previous narration's
// words, and the losses compound. With halfLife 4: 100%, 100%, 71%, 42%, 21%,
// 9%, 3%... This is the context bar, and it sets the drift.
function context(room) {
  let left = 1;
  for (let k = 3; k <= room; k++) left *= 1 - progress(k);
  return left;
}

// How far the next room may wander from the last, bolder as context runs out.
// Room 2 follows on, 3 slips, 4 barely connects, 5+ anywhere.
function drift(c) {
  if (c > 0.9) return "The next room follows naturally from the previous one.";
  if (c > 0.5) {
    return "The next room mostly follows from the previous one, but something impossible has crept in.";
  }
  if (c > 0.3) {
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
function userMessage({
  room,
  answer,
  importance,
  narration,
  clicked,
  clickedNote,
}) {
  if (room === 1) {
    return `The visitor was asked: "${config.question}" and answered: "${answer}". It matters to them ${importance} out of 10.\nDescribe the first room.\n\n${SCHEMA}`;
  }
  const p = progress(room);
  const previous = room === 2 ? narration : blur(narration, p);
  const original =
    room === 2 ? `\nThe visitor originally answered: "${answer}"` : "";
  return `Previous room: ${previous}\nThe visitor went further through: ${clicked} (${clickedNote})${original}\n${drift(context(room))}\nDescribe the next room.\n\n${SCHEMA}`;
}

function parseReply(text) {
  const room = JSON.parse(
    text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1),
  );
  assert(typeof room.narration === "string");
  assert(room.objects.length >= 3 && room.objects.length <= 4);
  for (const { name } of room.objects) {
    assert(/^[a-z0-9_]+\.(png|jpg|gif|txt|mp3|pdf)$/.test(name));
  }
  // A place the plans don't cover is drawn as nowhere.
  const layout = Object.hasOwn(PLANS, room.layout) ? room.layout : "void";
  return { narration: room.narration, layout, objects: room.objects };
}

app.post("/api/rooms", roomLimit, express.json(), async (req, res) => {
  const user = userMessage(req.body);

  // Retries a bad response once, then gives up.
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
      console.log(`room ${req.body.room} (${room.layout}): ${room.narration}`);
      return res.json({
        ...room,
        decay: progress(req.body.room),
        context: context(req.body.room),
      });
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

// Hosts choose the port and pass it in PORT; locally it is 8000.
const port = process.env.PORT ?? 8000;
app.listen(port, () => console.log(`http://localhost:${port}`));
