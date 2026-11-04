// Calls Claude once per room and saves everything to chain.json.
//   node generate.js --answer "a blue umbrella"
//   node generate.js --answer "a blue umbrella" --rooms 12 --model claude-sonnet-5-5
//   node generate.js --resume      (continue a run that stopped partway)

import Anthropic from "@anthropic-ai/sdk";
import assert from "node:assert";
import { readFileSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { decayRoom, rng } from "./lib/decay.js";

process.loadEnvFile(); // reads ANTHROPIC_API_KEY from .env

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

const { values: args } = parseArgs({
  options: {
    answer: { type: "string" },
    question: { type: "string" },
    rooms: { type: "string" },
    model: { type: "string" },
    seed: { type: "string" },
    resume: { type: "boolean" },
  },
});

const config = JSON.parse(readFileSync("config.json", "utf8"));
const chain = args.resume
  ? JSON.parse(readFileSync("chain.json", "utf8"))
  : {
      meta: {
        ...config,
        ...args,
        rooms: Number(args.rooms ?? config.rooms),
        seed: Number(args.seed ?? config.seed),
      },
      rooms: [],
    };
const { meta } = chain;
const client = new Anthropic();

// The forgetting lives here: room 3 on sees only the last room and the click.
function userMessage(room, narration, clicked) {
  if (room === 1) {
    return `The visitor was asked: "${meta.question}" and answered: "${meta.answer}".\nDescribe the first room.\n\n${SCHEMA}`;
  }
  const answer =
    room === 2 ? `\nThe visitor originally answered: "${meta.answer}"` : "";
  return `Previous room: ${narration}\nThe visitor opened: ${clicked}${answer}\nDescribe the next room.\n\n${SCHEMA}`;
}

// Retries a bad response once, then gives up.
async function askRoom(user) {
  for (let attempt = 1; ; attempt++) {
    // No temperature: the default of 1.0 is the point.
    const message = await client.messages.create({
      model: meta.model,
      max_tokens: 16000,
      system: SYSTEM,
      messages: [{ role: "user", content: user }],
    });
    const text =
      message.content.find((block) => block.type === "text")?.text ?? "";
    try {
      const room = JSON.parse(text.trim().replace(/^```(json)?|```$/g, ""));
      assert(
        room.objects.length >= 3 && room.objects.length <= 4,
        "needs 3 to 4 objects",
      );
      for (const { name } of room.objects) {
        assert(
          /^[a-z0-9_]+\.(png|jpg|gif|txt|mp3|pdf)$/.test(name),
          `bad filename: ${name}`,
        );
      }
      return room;
    } catch (error) {
      if (attempt === 2) throw error;
      console.log(`bad response (${error.message}), retrying`);
    }
  }
}

for (let room = chain.rooms.length + 1; room <= meta.rooms; room++) {
  const prev = chain.rooms.at(-1);
  // The next room is told the name the visitor saw, already decayed.
  const clicked =
    prev &&
    decayRoom(
      prev.response.objects.map((o) => o.name),
      prev.room,
      meta.rooms,
      meta.seed,
    )[prev.exit_index];
  const user = userMessage(room, prev?.response.narration, clicked);

  // The script never passes the answer on after room 2. (The model may still
  // repeat it in its own narration; that's the telephone game working.)
  if (room >= 3)
    assert(!user.replace(prev.response.narration, "").includes(meta.answer));

  const response = await askRoom(user);
  const exit_index = Math.floor(
    rng(meta.seed, room, "exit")() * response.objects.length,
  );
  chain.rooms.push({
    room,
    context_sent: { system: SYSTEM, user },
    response,
    exit_index,
  });
  writeFileSync("chain.json", JSON.stringify(chain, null, 2));
  console.log(`room ${room}: ${response.narration}`);
}
