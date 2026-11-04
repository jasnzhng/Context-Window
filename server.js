// Serves the React app and asks Claude for each room. The API key stays here,
// never in the browser. Run with: npm start
import Anthropic from "@anthropic-ai/sdk";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import express from "express";

const config = JSON.parse(readFileSync("config.json", "utf8"));
const client = new Anthropic(); // reads ANTHROPIC_API_KEY from .env
const app = express();

const SYSTEM = `You are the narrator of a house the visitor is walking through, one room
at a time. Write in second person, present tense, with total confidence,
as if you have always known this house and this visitor. Be concrete:
name specific objects, colors, materials and people. Never say you are an
AI. Never mention memory, context, or uncertainty. Never ask questions.
Return only JSON that matches the schema you are given.`;

// Placeholders only: an example filename here would show up in every room.
const SCHEMA = `Respond with JSON only, in this shape:
{"narration": "<2 to 4 sentences, at most 70 words>", "objects": [{"name": "<filename>", "note": "<one short sentence about it>"}]}
Include 3 to 4 objects. Each name is a lowercase filename using only a-z, 0-9 and underscores, ending in .png, .jpg, .gif, .txt, .mp3 or .pdf.`;

// The forgetting lives here. Room 1 sees the answer, room 2 sees room 1 and the
// answer, and room 3 on sees only the previous room and what was clicked.
function userMessage({ room, answer, narration, clicked }) {
  if (room === 1) {
    return `The visitor was asked: "${config.question}" and answered: "${answer}".\nDescribe the first room.\n\n${SCHEMA}`;
  }
  const original =
    room === 2 ? `\nThe visitor originally answered: "${answer}"` : "";
  return `Previous room: ${narration}\nThe visitor opened: ${clicked}${original}\nDescribe the next room.\n\n${SCHEMA}`;
}

app.post("/api/rooms", express.json(), async (req, res) => {
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
      const room = JSON.parse(text.trim().replace(/^```(json)?|```$/g, ""));
      assert(room.objects.length >= 3 && room.objects.length <= 4);
      for (const { name } of room.objects) {
        assert(/^[a-z0-9_]+\.(png|jpg|gif|txt|mp3|pdf)$/.test(name));
      }
      console.log(`room ${req.body.room}: ${room.narration}`);
      return res.json(room);
    } catch (error) {
      if (attempt === 2) throw error;
    }
  }
});

app.use(express.static("public"));

// Every other URL (/room/3, /end) is the React app; React Router picks the page.
app.get("/{*path}", (req, res) =>
  res.sendFile("index.html", { root: "public" }),
);

app.listen(8000, () => console.log("http://localhost:8000"));
